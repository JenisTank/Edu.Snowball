import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { PushService } from '../../modules/notifications/push.service';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { Throttle } from '@nestjs/throttler';
import { ParentLoginDto } from './dto/parent-login.dto';
import { istDateKey, validateLeave, canCancel } from '../leaves/leaves.rules';
import { CONSENT_TYPES, consentRegister } from '../privacy/privacy.rules';

// ─────────────────────────────────────────────────────────────
// Parent Portal API (Slice 6 — PWA)
// Parents log in with their registered phone + any child's admission no.
// The token carries all children linked to that phone (siblings included).
// DPDP guardrails: Discovery-Flight results, staff-only tabs (infirmary,
// IEP, child-support log, TC info) and internal escalations are NEVER
// exposed through these endpoints.
// ─────────────────────────────────────────────────────────────

const AY = '2026-27';
const num = (v: any) => (v == null ? 0 : Number(v));
const DUE: Record<string, string[]> = {
  PLAN_A: ['2026-04-10', '2026-07-10', '2026-10-10'],
  PLAN_B: ['2026-04-10', '2026-10-10'],
  PLAN_C: ['2026-04-10'],
};

@Controller('parent')
export class ParentController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private push: PushService,
  ) {}

  // ── Login: phone + admission number of any one child ──
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  async login(@Body() b: ParentLoginDto) {
    if (!b.phone?.trim() || !b.admissionNo?.trim())
      throw new BadRequestException('Phone and admission number are required');
    const norm = (p?: string | null) => (p ?? '').replace(/[\s-]/g, '');
    const phone = norm(b.phone);
    const child = await this.prisma.student.findFirst({
      where: { admissionNo: { equals: b.admissionNo.trim(), mode: 'insensitive' } },
    });
    if (!child || (norm(child.fatherPhone) !== phone && norm(child.motherPhone) !== phone)) {
      throw new UnauthorizedException('No child found for this phone + admission number');
    }
    // all children registered under this phone (siblings share the number)
    const all = await this.prisma.student.findMany({
      where: { status: { in: ['ACTIVE', 'REGISTERED'] } },
      select: { id: true, fatherPhone: true, motherPhone: true },
    });
    const children = all.filter(
      (c) => norm(c.fatherPhone) === phone || norm(c.motherPhone) === phone,
    );
    const parentName = norm(child.fatherPhone) === phone ? child.fatherName : child.motherName;
    const token = await this.jwt.signAsync(
      {
        sub: `parent:${phone}`,
        role: 'PARENT',
        phone,
        name: parentName ?? 'Parent',
        studentIds: children.map((c) => c.id),
        unitId: null,
      },
      { secret: env.jwtSecret, expiresIn: '7d' },
    );
    return {
      accessToken: token,
      parent: { name: parentName ?? 'Parent', phone, children: children.length },
    };
  }

  private guardChild(req: any, studentId: string) {
    if (req.user.role !== 'PARENT') throw new ForbiddenException('Parent portal only');
    if (!req.user.studentIds?.includes(studentId)) throw new ForbiddenException('Not your child');
  }

  // ── Children overview (safe fields only) ──
  @Get('children')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async children(@Req() req: any) {
    const kids = await this.prisma.student.findMany({
      where: { id: { in: req.user.studentIds ?? [] } },
      include: {
        programme: { select: { name: true, tierName: true, levelColour: true } },
        batch: { select: { name: true, startTime: true, endTime: true } },
        unit: { select: { name: true, code: true } },
      },
      orderBy: { firstName: 'asc' },
    });
    const today = new Date(new Date().toISOString().slice(0, 10));
    const monthStart = new Date(today);
    monthStart.setDate(1);
    const out: any[] = [];
    for (const k of kids) {
      const att = await this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { studentId: k.id, date: { gte: monthStart, lte: today } },
        _count: true,
      });
      const a: any = { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      att.forEach((r) => {
        a[r.status] = (r as any)._count;
      });
      const todayRec = await this.prisma.attendanceRecord.findFirst({
        where: { studentId: k.id, date: today },
      });
      out.push({
        id: k.id,
        admissionNo: k.admissionNo,
        firstName: k.firstName,
        lastName: k.lastName,
        dob: k.dob,
        status: k.status,
        programme: k.programme,
        batch: k.batch,
        unit: k.unit,
        attendanceThisMonth: a,
        today: todayRec?.status ?? null,
      });
    }
    return out;
  }

  // ── Attendance for a month ──
  @Get('child/:id/attendance')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async attendance(@Req() req: any, @Param('id') id: string, @Query('month') month?: string) {
    this.guardChild(req, id);
    const m = month ?? new Date().toISOString().slice(0, 7); // YYYY-MM
    const from = new Date(`${m}-01`);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    to.setDate(0);
    const recs = await this.prisma.attendanceRecord.findMany({
      where: { studentId: id, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { date: true, status: true },
    });
    const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0 } as any;
    recs.forEach((r) => counts[r.status]++);
    return { month: m, records: recs, counts };
  }

  // ── Fee ledger + receipts (preschool annual view; evening shown separately) ──
  @Get('child/:id/fees')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async fees(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const s = await this.prisma.student.findUnique({
      where: { id },
      include: { feeTransactions: { orderBy: { paymentDate: 'desc' } } },
    });
    if (!s) throw new NotFoundException();
    const structure = await this.prisma.feeStructure.findUnique({
      where: {
        unitId_programmeId_academicYear: {
          unitId: s.unitId,
          programmeId: s.programmeId,
          academicYear: AY,
        },
      },
    });
    const gross = num(structure?.totalFee);
    const discPct = s.siblingGroup ? num(structure?.siblingDiscountPct) : 0;
    const discount = Math.round((gross * discPct) / 100);
    const net = gross - discount;
    const plan = s.instalmentPlan ?? 'PLAN_C';
    let parts: number[];
    if (plan === 'PLAN_A') {
      const w = [
        num(structure?.instalment1),
        num(structure?.instalment2),
        num(structure?.instalment3),
      ];
      const tw = w[0] + w[1] + w[2] || 1;
      parts = w.map((x) => Math.round((net * x) / tw));
      parts[2] = net - parts[0] - parts[1];
    } else if (plan === 'PLAN_B') {
      parts = [Math.round(net / 2), net - Math.round(net / 2)];
    } else parts = [net];
    const paidTx = s.feeTransactions.filter((t) => !t.isCancelled && t.ledgerType === 'PRESCHOOL');
    const paid = paidTx.reduce((a, t) => a + num(t.amount), 0);
    let rem = paid;
    const todayISO = new Date().toISOString().slice(0, 10);
    const instalments = parts.map((amount, i) => {
      const alloc = Math.min(rem, amount);
      rem -= alloc;
      const dueDate = DUE[plan][i];
      return {
        no: i + 1,
        amount,
        dueDate,
        paid: alloc,
        status: alloc >= amount ? 'PAID' : dueDate < todayISO ? 'OVERDUE' : 'UPCOMING',
      };
    });
    return {
      plan,
      gross,
      discount,
      net,
      paid,
      balance: net - paid,
      instalments,
      receipts: s.feeTransactions
        .filter((t) => !t.isCancelled)
        .map((t) => ({
          id: t.id,
          receiptNo: t.receiptNo,
          amount: num(t.amount),
          mode: t.paymentMode,
          date: t.paymentDate,
          ledgerType: t.ledgerType,
        })),
    };
  }

  // ── Parent-safe child profile. Deliberately excludes health, infirmary, IEP,
  // child-support and internal screening fields.
  @Get('child/:id/profile')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async profile(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const child = await this.prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        dob: true,
        gender: true,
        admissionDate: true,
        academicYear: true,
        addressArea: true,
        status: true,
        programme: { select: { name: true, tierName: true } },
        batch: { select: { name: true, shift: true, startTime: true, endTime: true } },
        unit: { select: { name: true, address: true, phone: true, email: true } },
      },
    });
    if (!child) throw new NotFoundException();
    return child;
  }

  // Documents vault contains only already-issued, parent-safe documents.
  @Get('child/:id/documents')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async documents(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const [certificates, receipts] = await Promise.all([
      this.prisma.certificate.findMany({ where: { studentId: id }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.feeTransaction.findMany({
        where: { studentId: id, isCancelled: false },
        orderBy: { paymentDate: 'desc' },
        select: { id: true, receiptNo: true, paymentDate: true, amount: true },
      }),
    ]);
    return [
      ...certificates.map((c) => ({
        id: c.id,
        kind: 'CERTIFICATE',
        title: c.type.replace(/_/g, ' '),
        number: c.serialNo,
        date: c.issuedAt,
        url: `/api/certificates/${c.id}/print`,
        pdfUrl: `/api/certificates/${c.id}/pdf`,
      })),
      ...receipts.map((r) => ({
        id: r.id,
        kind: 'RECEIPT',
        title: 'Fee receipt',
        number: r.receiptNo,
        date: r.paymentDate,
        amount: Number(r.amount),
        url: `/api/fees/receipt/${r.id}/print`,
        pdfUrl: `/api/fees/receipt/${r.id}/pdf`,
      })),
    ].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }

  @Get('child/:id/conversation')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async conversation(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    await this.prisma.parentMessage.updateMany({
      where: { studentId: id, sender: 'CENTRE_HEAD', readAt: null },
      data: { readAt: new Date() },
    });
    return this.prisma.parentMessage.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  @Post('child/:id/conversation')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async sendMessage(@Req() req: any, @Param('id') id: string, @Body() b: { body: string }) {
    this.guardChild(req, id);
    if (!b.body?.trim() || b.body.trim().length > 1000)
      throw new BadRequestException('Message must be 1–1000 characters');
    const child = await this.prisma.student.findUnique({ where: { id }, select: { unitId: true } });
    if (!child) throw new NotFoundException();
    return this.prisma.parentMessage.create({
      data: { studentId: id, unitId: child.unitId, sender: 'PARENT', body: b.body.trim() },
    });
  }

  // ── Leave applications (spec: approved leave suppresses absence alerts) ──
  @Get('child/:id/leaves')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async leaves(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    return this.prisma.studentLeave.findMany({
      where: { studentId: id },
      orderBy: { fromDate: 'desc' },
      take: 50,
    });
  }

  @Post('child/:id/leaves')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async applyLeave(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: { fromDate: string; toDate: string; type?: string; reason: string },
  ) {
    this.guardChild(req, id);
    const error = validateLeave(b);
    if (error) throw new BadRequestException(error);
    const child = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true, unitId: true, firstName: true, status: true },
    });
    if (!child) throw new NotFoundException();
    if (child.status !== 'ACTIVE')
      throw new BadRequestException('Only active students can take leave');
    const leave = await this.prisma.studentLeave.create({
      data: {
        studentId: id,
        unitId: child.unitId,
        fromDate: new Date(`${b.fromDate}T00:00:00Z`),
        toDate: new Date(`${b.toDate}T00:00:00Z`),
        type: ['PLANNED', 'SICK', 'FAMILY', 'OTHER'].includes(b.type ?? '') ? b.type! : 'PLANNED',
        reason: b.reason.trim(),
        source: 'PARENT',
      },
    });
    // Tell the Centre Head there is something to approve.
    await this.prisma.messageLog.create({
      data: {
        type: 'LEAVE_REQUEST',
        channel: 'INTERNAL',
        recipient: 'CENTRE_HEAD',
        studentId: id,
        unitId: child.unitId,
        payload: {
          leaveId: leave.id,
          child: child.firstName,
          fromDate: b.fromDate,
          toDate: b.toDate,
          reason: b.reason.trim(),
        },
      },
    });
    return leave;
  }

  @Post('child/:id/leaves/:leaveId/cancel')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async cancelLeave(@Req() req: any, @Param('id') id: string, @Param('leaveId') leaveId: string) {
    this.guardChild(req, id);
    const leave = await this.prisma.studentLeave.findFirst({
      where: { id: leaveId, studentId: id },
    });
    if (!leave) throw new NotFoundException('Leave not found');
    const from = leave.fromDate.toISOString().slice(0, 10);
    if (!canCancel(leave.status, from, istDateKey()))
      throw new BadRequestException(
        'This leave can no longer be cancelled — please call the centre',
      );
    await this.prisma.attendanceRecord.deleteMany({
      where: {
        studentId: id,
        date: leave.fromDate,
        status: 'LEAVE',
        overrideReason: 'Approved leave',
      },
    });
    return this.prisma.studentLeave.update({
      where: { id: leaveId },
      data: { status: 'CANCELLED' },
    });
  }

  // ── PTM: the sessions the family is invited to, with their booked slot ──
  @Get('child/:id/ptm')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async ptm(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const records = await this.prisma.ptmRecord.findMany({
      where: { studentId: id },
      include: {
        session: { include: { slots: { orderBy: { startTime: 'asc' } } } },
      },
      orderBy: { session: { scheduledAt: 'desc' } },
      take: 20,
    });
    return records.map((r: any) => ({
      session: {
        id: r.session.id,
        title: r.session.title,
        scheduledAt: r.session.scheduledAt,
        status: r.session.status,
      },
      record: {
        attended: r.attended,
        parentNames: r.parentNames,
        teacherNotes: r.teacherNotes,
      },
      mySlot: r.session.slots.find((s: any) => s.studentId === id) ?? null,
      openSlots: r.session.slots
        .filter((s: any) => !s.studentId)
        .map((s: any) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
    }));
  }

  // ── DPDP: the parent's own consent register ──
  @Get('child/:id/consents')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async consents(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const rows = await this.prisma.consentLog.findMany({
      where: { studentId: id },
      orderBy: { grantedAt: 'desc' },
    });
    return { ...consentRegister(rows), available: CONSENT_TYPES };
  }

  @Post('child/:id/consents')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async recordConsent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: { decisions: Record<string, boolean> },
  ) {
    this.guardChild(req, id);
    const decisions = b?.decisions ?? {};
    const unknown = Object.keys(decisions).filter((k) => !CONSENT_TYPES.includes(k as any));
    if (unknown.length)
      throw new BadRequestException(`Unknown consent types: ${unknown.join(', ')}`);
    // Core processing cannot be switched off while the child is enrolled.
    if (decisions.DATA_PROCESSING === false)
      throw new BadRequestException(
        'Core data processing cannot be withdrawn while your child is enrolled — please speak to the centre',
      );
    if (!Object.keys(decisions).length)
      throw new BadRequestException('No consent decisions supplied');
    for (const [type, granted] of Object.entries(decisions)) {
      await this.prisma.consentLog.create({
        data: { studentId: id, consentType: type, granted: !!granted, grantedBy: req.user.name },
      });
    }
    return { ok: true, recorded: Object.keys(decisions).length };
  }

  /** Everything the portal holds about one child, for the family's own records. */
  @Get('child/:id/data')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async myData(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const [student, attendance, fees, consents, certificates, leaves] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id },
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          dob: true,
          status: true,
          admissionDate: true,
          academicYear: true,
          addressArea: true,
          fatherName: true,
          fatherPhone: true,
          motherName: true,
          motherPhone: true,
          guardianEmail: true,
          programme: { select: { name: true } },
          batch: { select: { name: true, startTime: true } },
          unit: { select: { name: true } },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { studentId: id },
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.feeTransaction.findMany({
        where: { studentId: id },
        select: {
          receiptNo: true,
          amount: true,
          paymentMode: true,
          paymentDate: true,
          ledgerType: true,
        },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.consentLog.findMany({ where: { studentId: id }, orderBy: { grantedAt: 'asc' } }),
      this.prisma.certificate.findMany({
        where: { studentId: id },
        select: { type: true, serialNo: true, issuedAt: true },
      }),
      this.prisma.studentLeave.findMany({
        where: { studentId: id },
        select: { fromDate: true, toDate: true, type: true, status: true, reason: true },
      }),
    ]);
    return {
      generatedAt: new Date(),
      note: 'This is the personal data the parent portal holds about your child (DPDP Act 2023, section 11).',
      student,
      attendance,
      fees,
      consents,
      certificates,
      leaves,
    };
  }

  @Get('push/config')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  pushConfig() {
    return { publicKey: env.vapidPublicKey || null, enabled: this.push.enabled() };
  }

  @Post('push/subscribe')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async subscribe(@Req() req: any, @Body() b: any) {
    if (!b?.endpoint || !b?.keys?.p256dh || !b?.keys?.auth)
      throw new BadRequestException('Invalid push subscription');
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: b.endpoint },
      create: {
        phone: req.user.phone,
        endpoint: b.endpoint,
        p256dh: b.keys.p256dh,
        auth: b.keys.auth,
      },
      update: { phone: req.user.phone, p256dh: b.keys.p256dh, auth: b.keys.auth },
    });
    return { ok: true };
  }

  @Delete('push/subscribe')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async unsubscribe(@Req() req: any, @Body() b: { endpoint: string }) {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: b.endpoint, phone: req.user.phone },
    });
    return { ok: true };
  }

  // ── Lifecycle records the centre marked as parent-visible ──
  @Get('child/:id/lifecycle')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async lifecycle(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    return this.prisma.studentLifecycleRecord.findMany({
      where: { studentId: id, visibility: 'STAFF_PARENT' },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  // ── Messages sent to this parent (parent-safe types only) ──
  @Get('messages')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  messages(@Req() req: any) {
    return this.prisma.messageLog.findMany({
      where: {
        studentId: { in: req.user.studentIds ?? [] },
        type: {
          in: [
            'ABSENCE_ALERT',
            'FEE_REMINDER',
            'RECEIPT',
            'ANNOUNCEMENT',
            'LEAVE_APPROVED',
            'LEAVE_REJECTED',
          ],
        }, // never internal escalations
      },
      include: { student: { select: { firstName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

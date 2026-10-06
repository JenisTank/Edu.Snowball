import {
  Body, Controller, Get, Module, Param, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, Roles } from '../auth/auth';
import { PrismaService } from '../prisma.service';

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
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // ── Login: phone + admission number of any one child ──
  @Post('login')
  async login(@Body() b: { phone: string; admissionNo: string }) {
    if (!b.phone?.trim() || !b.admissionNo?.trim()) throw new BadRequestException('Phone and admission number are required');
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
    const children = all.filter(c => norm(c.fatherPhone) === phone || norm(c.motherPhone) === phone);
    const parentName = norm(child.fatherPhone) === phone ? child.fatherName : child.motherName;
    const token = await this.jwt.signAsync(
      { sub: `parent:${phone}`, role: 'PARENT', phone, name: parentName ?? 'Parent', studentIds: children.map(c => c.id), unitId: null },
      { secret: process.env.JWT_SECRET, expiresIn: '7d' },
    );
    return { accessToken: token, parent: { name: parentName ?? 'Parent', phone, children: children.length } };
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
    const monthStart = new Date(today); monthStart.setDate(1);
    const out = [];
    for (const k of kids) {
      const att = await this.prisma.attendanceRecord.groupBy({
        by: ['status'], where: { studentId: k.id, date: { gte: monthStart, lte: today } }, _count: true,
      });
      const a: any = { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      att.forEach(r => { a[r.status] = (r as any)._count; });
      const todayRec = await this.prisma.attendanceRecord.findFirst({ where: { studentId: k.id, date: today } });
      out.push({
        id: k.id, admissionNo: k.admissionNo, firstName: k.firstName, lastName: k.lastName,
        dob: k.dob, status: k.status,
        programme: k.programme, batch: k.batch, unit: k.unit,
        attendanceThisMonth: a, today: todayRec?.status ?? null,
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
    const to = new Date(from); to.setMonth(to.getMonth() + 1); to.setDate(0);
    const recs = await this.prisma.attendanceRecord.findMany({
      where: { studentId: id, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { date: true, status: true },
    });
    const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0 } as any;
    recs.forEach(r => counts[r.status]++);
    return { month: m, records: recs, counts };
  }

  // ── Fee ledger + receipts (preschool annual view; evening shown separately) ──
  @Get('child/:id/fees')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  async fees(@Req() req: any, @Param('id') id: string) {
    this.guardChild(req, id);
    const s = await this.prisma.student.findUnique({ where: { id }, include: { feeTransactions: { orderBy: { paymentDate: 'desc' } } } });
    if (!s) throw new NotFoundException();
    const structure = await this.prisma.feeStructure.findUnique({
      where: { unitId_programmeId_academicYear: { unitId: s.unitId, programmeId: s.programmeId, academicYear: AY } },
    });
    const gross = num(structure?.totalFee);
    const discPct = s.siblingGroup ? num(structure?.siblingDiscountPct) : 0;
    const discount = Math.round(gross * discPct / 100);
    const net = gross - discount;
    const plan = s.instalmentPlan ?? 'PLAN_C';
    let parts: number[];
    if (plan === 'PLAN_A') {
      const w = [num(structure?.instalment1), num(structure?.instalment2), num(structure?.instalment3)];
      const tw = w[0] + w[1] + w[2] || 1;
      parts = w.map(x => Math.round(net * x / tw)); parts[2] = net - parts[0] - parts[1];
    } else if (plan === 'PLAN_B') { parts = [Math.round(net / 2), net - Math.round(net / 2)]; }
    else parts = [net];
    const paidTx = s.feeTransactions.filter(t => !t.isCancelled && t.ledgerType === 'PRESCHOOL');
    const paid = paidTx.reduce((a, t) => a + num(t.amount), 0);
    let rem = paid;
    const todayISO = new Date().toISOString().slice(0, 10);
    const instalments = parts.map((amount, i) => {
      const alloc = Math.min(rem, amount); rem -= alloc;
      const dueDate = DUE[plan][i];
      return { no: i + 1, amount, dueDate, paid: alloc, status: alloc >= amount ? 'PAID' : dueDate < todayISO ? 'OVERDUE' : 'UPCOMING' };
    });
    return {
      plan, gross, discount, net, paid, balance: net - paid, instalments,
      receipts: s.feeTransactions.filter(t => !t.isCancelled).map(t => ({
        id: t.id, receiptNo: t.receiptNo, amount: num(t.amount), mode: t.paymentMode,
        date: t.paymentDate, ledgerType: t.ledgerType,
      })),
    };
  }

  // ── Messages sent to this parent (parent-safe types only) ──
  @Get('messages')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  messages(@Req() req: any) {
    return this.prisma.messageLog.findMany({
      where: {
        studentId: { in: req.user.studentIds ?? [] },
        type: { in: ['ABSENCE_ALERT', 'FEE_REMINDER', 'RECEIPT', 'ANNOUNCEMENT'] }, // never internal escalations
      },
      include: { student: { select: { firstName: true } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
  }
}

@Module({ controllers: [ParentController], providers: [PrismaService] })
export class ParentModule {}

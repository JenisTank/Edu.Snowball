import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { unitScope } from '../../common/auth/unit-scope';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PushService } from '../notifications/push.service';
import {
  canCancel,
  canDecide,
  daysInclusive,
  datesInclusive,
  istDateKey,
  LEAVE_TYPES,
  validateLeave,
} from './leaves.rules';

// ─────────────────────────────────────────────────────────────
// Student leave applications (spec: "approved leave suppresses absence
// alerts"). Parents file from the portal; the front desk can log a phone-in
// leave. Only a Centre Head (or HO) can approve — an unreviewed leave never
// silences the safety net.
// ─────────────────────────────────────────────────────────────

const LOG_ROLES = [
  'FOUNDER',
  'ACADEMIC_DIR',
  'CENTRE_HEAD',
  'COORDINATOR',
  'RECEPTIONIST',
  'TEACHER',
];
const DECIDE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'];

@Controller('leaves')
@UseGuards(AuthGuard)
export class LeavesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private push: PushService,
  ) {}

  // ── Staff view: the leave register ──
  @Get()
  @Roles(...LOG_ROLES)
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('unitId') unitId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('studentId') studentId?: string,
  ) {
    const scope = unitScope(req.user, unitId);
    return this.prisma.studentLeave.findMany({
      where: {
        ...scope,
        ...(status ? { status } : {}),
        ...(studentId ? { studentId } : {}),
        ...(from || to
          ? {
              fromDate: from ? { gte: new Date(`${from}T00:00:00Z`) } : undefined,
              toDate: to ? { lte: new Date(`${to}T00:00:00Z`) } : undefined,
            }
          : {}),
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            batch: { select: { id: true, name: true } },
            unit: { select: { code: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { fromDate: 'asc' }],
      take: 300,
    });
  }

  /** Pending count for the bell in the header. */
  @Get('pending')
  @Roles(...DECIDE_ROLES)
  async pending(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const rows = await this.prisma.studentLeave.findMany({
      where: { ...scope, status: 'PENDING' },
      include: {
        student: {
          select: { firstName: true, lastName: true, admissionNo: true },
        },
      },
      orderBy: { fromDate: 'asc' },
    });
    return { count: rows.length, rows };
  }

  // ── Front desk logs a phone-in leave ──
  @Post()
  @Roles(...LOG_ROLES)
  async create(
    @Req() req: any,
    @Body()
    b: {
      studentId: string;
      fromDate: string;
      toDate: string;
      type?: string;
      reason: string;
    },
  ) {
    const error = validateLeave(b);
    if (error) throw new BadRequestException(error);
    const student = await this.prisma.student.findUnique({
      where: { id: b.studentId },
      select: { id: true, unitId: true, firstName: true, lastName: true, status: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'ACTIVE' && student.status !== 'REGISTERED')
      throw new BadRequestException('Only active students can take leave');
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new BadRequestException('Student is outside your unit');

    const type = LEAVE_TYPES.includes((b.type as any) ?? 'PLANNED')
      ? (b.type ?? 'PLANNED')
      : 'PLANNED';
    const row = await this.prisma.studentLeave.create({
      data: {
        studentId: student.id,
        unitId: student.unitId,
        fromDate: new Date(`${b.fromDate}T00:00:00Z`),
        toDate: new Date(`${b.toDate}T00:00:00Z`),
        type,
        reason: b.reason.trim(),
        source: 'STAFF',
        appliedById: req.user.sub,
        status: 'PENDING',
      },
    });
    await this.audit.log(req, 'student_leaves', row.id, 'INSERT', null, row);
    return row;
  }

  // ── Approve: silences the absence chain for those days ──
  @Post(':id/approve')
  @Roles(...DECIDE_ROLES)
  async approve(@Req() req: any, @Param('id') id: string, @Body() b: { note?: string }) {
    const leave = await this.prisma.studentLeave.findUnique({
      where: { id },
      include: {
        student: {
          select: { unitId: true, firstName: true, fatherPhone: true, motherPhone: true },
        },
      },
    });
    if (!leave) throw new NotFoundException('Leave not found');
    if (!HO_ROLES.includes(req.user.role) && leave.unitId !== req.user.unitId)
      throw new BadRequestException('Leave is outside your unit');
    if (!canDecide(leave.status))
      throw new BadRequestException(`This leave is already ${leave.status.toLowerCase()}`);

    const updated = await this.prisma.studentLeave.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedById: req.user.sub,
        decidedAt: new Date(),
        decisionNote: b?.note?.trim() || null,
      },
    });

    // Mark the days as LEAVE so the register reads correctly and the
    // absence scan has nothing to escalate.
    const batch = await this.prisma.student.findUnique({
      where: { id: leave.studentId },
      select: { batchId: true, unitId: true },
    });
    if (batch?.batchId) {
      for (const day of datesInclusive(
        leave.fromDate.toISOString().slice(0, 10),
        leave.toDate.toISOString().slice(0, 10),
      )) {
        const date = new Date(`${day}T00:00:00Z`);
        const existing = await this.prisma.attendanceRecord.findUnique({
          where: {
            studentId_date_batchId: {
              studentId: leave.studentId,
              date,
              batchId: batch.batchId,
            },
          },
        });
        if (existing?.markedAt && existing.status !== 'LEAVE') continue; // never overwrite a human marking
        await this.prisma.attendanceRecord.upsert({
          where: {
            studentId_date_batchId: {
              studentId: leave.studentId,
              date,
              batchId: batch.batchId,
            },
          },
          update: { status: 'LEAVE', overrideReason: 'Approved leave' },
          create: {
            studentId: leave.studentId,
            batchId: batch.batchId,
            unitId: leave.unitId,
            date,
            status: 'LEAVE',
            overrideReason: 'Approved leave',
          },
        });
      }
    }

    const phone = leave.student.fatherPhone || leave.student.motherPhone;
    if (phone)
      await this.push.send(phone, {
        title: 'Leave approved',
        body: `Your leave request for ${leave.student.firstName} (${daysInclusive(
          leave.fromDate.toISOString().slice(0, 10),
          leave.toDate.toISOString().slice(0, 10),
        )} day${daysInclusive(leave.fromDate.toISOString().slice(0, 10), leave.toDate.toISOString().slice(0, 10)) > 1 ? 's' : ''}) is approved.`,
        url: '/parent',
        tag: `leave-${leave.id}`,
      });
    await this.audit.log(
      req,
      'student_leaves',
      id,
      'UPDATE',
      { status: 'PENDING' },
      { status: 'APPROVED' },
    );
    return updated;
  }

  @Post(':id/reject')
  @Roles(...DECIDE_ROLES)
  async reject(@Req() req: any, @Param('id') id: string, @Body() b: { note?: string }) {
    const leave = await this.prisma.studentLeave.findUnique({
      where: { id },
      include: { student: { select: { firstName: true, fatherPhone: true, motherPhone: true } } },
    });
    if (!leave) throw new NotFoundException('Leave not found');
    if (!HO_ROLES.includes(req.user.role) && leave.unitId !== req.user.unitId)
      throw new BadRequestException('Leave is outside your unit');
    if (!canDecide(leave.status))
      throw new BadRequestException(`This leave is already ${leave.status.toLowerCase()}`);
    const updated = await this.prisma.studentLeave.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedById: req.user.sub,
        decidedAt: new Date(),
        decisionNote: b?.note?.trim() || null,
      },
    });
    const phone = leave.student.fatherPhone || leave.student.motherPhone;
    if (phone)
      await this.push.send(phone, {
        title: 'Leave not approved',
        body: `Please call the centre to discuss ${leave.student.firstName}'s leave request.`,
        url: '/parent',
        tag: `leave-${leave.id}`,
      });
    await this.audit.log(
      req,
      'student_leaves',
      id,
      'UPDATE',
      { status: 'PENDING' },
      { status: 'REJECTED' },
    );
    return updated;
  }

  @Post(':id/cancel')
  @Roles(...LOG_ROLES)
  async cancel(@Req() req: any, @Param('id') id: string) {
    const leave = await this.prisma.studentLeave.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Leave not found');
    if (!HO_ROLES.includes(req.user.role) && leave.unitId !== req.user.unitId)
      throw new BadRequestException('Leave is outside your unit');
    const from = leave.fromDate.toISOString().slice(0, 10);
    if (!canCancel(leave.status, from, istDateKey()))
      throw new BadRequestException('Leave can only be cancelled before it starts');
    const updated = await this.prisma.studentLeave.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    // Undo the auto-marked days that are still in the future.
    for (const day of datesInclusive(from, leave.toDate.toISOString().slice(0, 10))) {
      if (day < istDateKey()) continue;
      await this.prisma.attendanceRecord.deleteMany({
        where: {
          studentId: leave.studentId,
          date: new Date(`${day}T00:00:00Z`),
          status: 'LEAVE',
          overrideReason: 'Approved leave',
        },
      });
    }
    await this.audit.log(
      req,
      'student_leaves',
      id,
      'UPDATE',
      { status: leave.status },
      { status: 'CANCELLED' },
    );
    return updated;
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { unitScope } from '../../common/auth/unit-scope';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { bbQueue } from '../../jobs/queue';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { lockTimes, reportRange, summariseAttendance, summariseTotals } from './attendance.rules';
import { approvedLeaveMap } from '../leaves/leaves.query';
import { runDailyScan } from '../../jobs/scheduler';

const MARK_ROLES = ['TEACHER', 'COORDINATOR', 'CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR'];
const OVERRIDE_ROLES = ['CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR'];

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ── Roster for a batch + date: every ACTIVE student, DEFAULT ABSENT ──
  @Get('roster')
  @Roles(...MARK_ROLES)
  async roster(@Req() req: any, @Query('batchId') batchId: string, @Query('date') date?: string) {
    if (!batchId) throw new BadRequestException('batchId required');
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { unit: { select: { code: true } } },
    });
    if (!batch) throw new BadRequestException('Unknown batch');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== batch.unitId)
      throw new ForbiddenException('Cross-unit access denied');

    const d = date || new Date().toISOString().slice(0, 10);
    const { lockAt, absenceMsgAt, adminCallAt } = lockTimes(d, batch.startTime);
    const students = await this.prisma.student.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        fatherPhone: true,
        motherPhone: true,
      },
      orderBy: { firstName: 'asc' },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { batchId, date: new Date(d) },
    });
    const recMap = new Map<string, any>(records.map((r: any) => [r.studentId, r]));
    // Approved leave is surfaced so the teacher sees why a child is absent.
    const onLeave = await approvedLeaveMap(this.prisma, d, batch.unitId);
    const now = new Date();
    return {
      batch: { id: batch.id, name: batch.name, startTime: batch.startTime, unit: batch.unit.code },
      date: d,
      lockAt,
      absenceMsgAt,
      adminCallAt,
      locked: now > lockAt,
      // DEFAULT = ABSENT (child-safety rule): unmarked students are absent
      roster: students.map((s) => {
        const r = recMap.get(s.id);
        return {
          ...s,
          status: r?.status ?? 'ABSENT',
          marked: !!r?.markedAt,
          overridden: !!r?.overrideById,
          onLeave: onLeave.has(s.id),
          leaveType: onLeave.get(s.id)?.type ?? null,
        };
      }),
    };
  }

  // ── Mark attendance (teacher active-marks PRESENT; after lock = CH override + reason) ──
  @Post('mark')
  @Roles(...MARK_ROLES)
  async mark(@Req() req: any, @Body() body: MarkAttendanceDto) {
    const { batchId, entries } = body;
    if (!batchId || !entries?.length)
      throw new BadRequestException('batchId and entries are required');
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new BadRequestException('Unknown batch');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== batch.unitId)
      throw new ForbiddenException('Cross-unit access denied');

    const d = body.date || new Date().toISOString().slice(0, 10);
    const { lockAt, absenceMsgAt } = lockTimes(d, batch.startTime);
    const now = new Date();
    const isLate = now > lockAt;
    if (isLate) {
      if (!OVERRIDE_ROLES.includes(req.user.role)) {
        throw new ForbiddenException(
          `Attendance locked at ${lockAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (start + 30 min). Ask your Centre Head to override.`,
        );
      }
      if (!body.overrideReason?.trim())
        throw new BadRequestException('Post-lock changes require an override reason (audited)');
    }

    for (const e of entries) {
      if (!['PRESENT', 'ABSENT', 'LEAVE'].includes(e.status))
        throw new BadRequestException(`Invalid status ${e.status}`);
      await this.prisma.attendanceRecord.upsert({
        where: { studentId_date_batchId: { studentId: e.studentId, date: new Date(d), batchId } },
        update: {
          status: e.status as any,
          markedById: req.user.sub,
          markedAt: now,
          isLocked: isLate,
          lockTime: lockAt,
          ...(isLate ? { overrideById: req.user.sub, overrideReason: body.overrideReason } : {}),
        },
        create: {
          studentId: e.studentId,
          batchId,
          unitId: batch.unitId,
          date: new Date(d),
          status: e.status as any,
          markedById: req.user.sub,
          markedAt: now,
          isLocked: isLate,
          lockTime: lockAt,
          ...(isLate ? { overrideById: req.user.sub, overrideReason: body.overrideReason } : {}),
        },
      });
    }
    await this.audit.log(req, 'attendance_records', `${batchId}:${d}`, 'UPDATE', null, {
      marked: entries.length,
      late: isLate,
      reason: body.overrideReason ?? null,
    });

    // ── Queue the absence scan at lock + 30 min (or immediately if past) ──
    const delay = Math.max(0, absenceMsgAt.getTime() - now.getTime());
    await bbQueue
      .add('absence-scan', { batchId, date: d }, { delay, jobId: `absence-${batchId}-${d}` })
      .catch(() => null);

    return { ok: true, marked: entries.length, locked: isLate, absenceScanAt: absenceMsgAt };
  }

  // ── Day summary (per unit) ──
  @Get('summary')
  async summary(@Req() req: any, @Query('date') date?: string, @Query('unitId') unitId?: string) {
    const d = new Date(date || new Date().toISOString().slice(0, 10));
    const scope = unitScope(req.user, unitId);
    const batches = await this.prisma.batch.findMany({
      where: { isActive: true, ...scope },
      include: {
        unit: { select: { code: true } },
        programme: { select: { name: true, levelColour: true } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ unitId: 'asc' }, { startTime: 'asc' }],
    });
    const recs = await this.prisma.attendanceRecord.groupBy({
      by: ['batchId', 'status'],
      where: { date: d, ...scope },
      _count: true,
    });
    const agg = new Map<string, any>();
    for (const r of recs) {
      const a = agg.get(r.batchId) ?? { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      a[r.status] = (r as any)._count;
      agg.set(r.batchId, a);
    }
    return batches.map((b) => {
      const a = agg.get(b.id) ?? { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      const { lockAt } = lockTimes(d.toISOString().slice(0, 10), b.startTime);
      return {
        batchId: b.id,
        name: b.name,
        unit: b.unit.code,
        programme: b.programme,
        startTime: b.startTime,
        lockAt,
        locked: new Date() > lockAt,
        total: b._count.students,
        present: a.PRESENT,
        absent: a.ABSENT,
        leave: a.LEAVE,
        marked: a.PRESENT + a.ABSENT + a.LEAVE,
      };
    });
  }

  // ── Reports: per batch and per student over a date range ──
  //
  // Before this, the only "report" was a single day's summary pinned to the
  // dashboard. A Centre Head needs the term view: who is drifting, and does the
  // family know. Percentages are over *marked* days, so holidays and registers
  // nobody opened never count as absences.

  @Get('reports/batch/:batchId')
  @Roles('TEACHER', 'COORDINATOR', 'CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR')
  async batchReport(
    @Req() req: any,
    @Param('batchId') batchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportRange(from, to);
    if ('error' in range) throw new BadRequestException(range.error);
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { unit: { select: { code: true } }, programme: { select: { name: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!HO_ROLES.includes(req.user.role) && batch.unitId !== req.user.unitId)
      throw new ForbiddenException();
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        batchId,
        date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) },
      },
      select: { studentId: true, status: true },
    });
    const students = await this.prisma.student.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
    });
    const byStudent = summariseAttendance(rows as any[]);
    const seen = new Map(byStudent.map((s) => [s.studentId, s]));
    // A student with no rows still appears — silence is the finding.
    const summaries = students.map((stu: any) => {
      const sum = seen.get(stu.id);
      return {
        studentId: stu.id,
        admissionNo: stu.admissionNo,
        name: `${stu.firstName} ${stu.lastName}`,
        present: sum?.present ?? 0,
        absent: sum?.absent ?? 0,
        leave: sum?.leave ?? 0,
        marked: sum?.marked ?? 0,
        percent: sum?.percent ?? 0,
      };
    });
    return {
      batch: {
        id: batch.id,
        name: batch.name,
        unit: batch.unit.code,
        programme: batch.programme.name,
      },
      range,
      totals: summariseTotals(rows as any[]),
      students: summaries.sort((a, b) => a.percent - b.percent),
    };
  }

  @Get('reports/student/:studentId')
  async studentReport(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportRange(from, to);
    if ('error' in range) throw new BadRequestException(range.error);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true, unitId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const isParent = req.user.role === 'PARENT';
    if (isParent) {
      if (!(req.user.studentIds ?? []).includes(studentId)) throw new ForbiddenException();
    } else if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId) {
      throw new ForbiddenException();
    }
    const rows = await this.prisma.attendanceRecord.findMany({
      where: {
        studentId,
        date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) },
      },
      select: { date: true, status: true, batchId: true, overrideReason: true },
      orderBy: { date: 'asc' },
    });
    return {
      student,
      range,
      totals: summariseTotals(rows as any[]),
      days: (rows as any[]).map((r) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        status: r.status,
        batchId: r.batchId,
        overrideReason: r.overrideReason ?? null,
      })),
    };
  }

  // ── The 05:00 plan, for ops verification (spec: "daily lock jobs") ──
  @Get('daily-plan')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  dailyPlan(@Req() req: any) {
    return runDailyScan(this.prisma, { force: true, now: new Date() }).then((r) => ({
      ...r,
      plans: HO_ROLES.includes(req.user.role)
        ? r.plans
        : r.plans.filter((p) => p.unitId === req.user.unitId),
    }));
  }

  /** Backfill: derive (and enqueue) today's plan on demand. Idempotent. */
  @Post('daily-scan')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async dailyScan(@Req() req: any) {
    const result = await runDailyScan(this.prisma, { force: true, now: new Date() });
    await this.audit.log(
      req,
      'attendance_records',
      `daily-plan:${result.dateISO}`,
      'UPDATE',
      null,
      {
        planned: result.planned,
        enqueued: result.enqueued,
        queueAvailable: result.queueAvailable,
      },
    );
    return result;
  }

  // ── Message queue view (absence alerts, escalations, admin calls) ──
  @Get('messages')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  messages(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role)
      ? unitId
        ? { unitId }
        : {}
      : { unitId: req.user.unitId };
    return this.prisma.messageLog.findMany({
      where: {
        ...scope,
        type: { in: ['ABSENCE_ALERT', 'ESCALATION_3DAY', 'ADMIN_CALL', 'TEACHER_NOT_MARKED'] },
      },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

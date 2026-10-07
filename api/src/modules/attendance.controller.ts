import {
  Body, Controller, Get, Module, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';
import { bbQueue } from './queue';

const MARK_ROLES = ['TEACHER', 'COORDINATOR', 'CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR'];
const OVERRIDE_ROLES = ['CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR'];
const IST = '+05:30';

// Dynamic timing (Rule 5): everything derives from the batch master.
export function lockTimes(dateISO: string, startTime: string) {
  const start = new Date(`${dateISO}T${startTime}:00${IST}`);
  const lockAt = new Date(start.getTime() + 30 * 60 * 1000); // start + 30 min
  const absenceMsgAt = new Date(lockAt.getTime() + 30 * 60 * 1000); // lock + 30 min
  const adminCallAt = new Date(lockAt.getTime() + 120 * 60 * 1000); // lock + 2 h
  return { start, lockAt, absenceMsgAt, adminCallAt };
}

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── Roster for a batch + date: every ACTIVE student, DEFAULT ABSENT ──
  @Get('roster')
  @Roles(...MARK_ROLES)
  async roster(@Req() req: any, @Query('batchId') batchId: string, @Query('date') date?: string) {
    if (!batchId) throw new BadRequestException('batchId required');
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId }, include: { unit: { select: { code: true } } } });
    if (!batch) throw new BadRequestException('Unknown batch');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== batch.unitId) throw new ForbiddenException('Cross-unit access denied');

    const d = date || new Date().toISOString().slice(0, 10);
    const { lockAt, absenceMsgAt, adminCallAt } = lockTimes(d, batch.startTime);
    const students = await this.prisma.student.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: { id: true, admissionNo: true, firstName: true, lastName: true, fatherPhone: true, motherPhone: true },
      orderBy: { firstName: 'asc' },
    });
    const records = await this.prisma.attendanceRecord.findMany({ where: { batchId, date: new Date(d) } });
    const recMap = new Map<string, any>(records.map((r: any) => [r.studentId, r]));
    const now = new Date();
    return {
      batch: { id: batch.id, name: batch.name, startTime: batch.startTime, unit: batch.unit.code },
      date: d,
      lockAt, absenceMsgAt, adminCallAt,
      locked: now > lockAt,
      // DEFAULT = ABSENT (child-safety rule): unmarked students are absent
      roster: students.map(s => {
        const r = recMap.get(s.id);
        return {
          ...s,
          status: r?.status ?? 'ABSENT',
          marked: !!r?.markedAt,
          overridden: !!r?.overrideById,
        };
      }),
    };
  }

  // ── Mark attendance (teacher active-marks PRESENT; after lock = CH override + reason) ──
  @Post('mark')
  @Roles(...MARK_ROLES)
  async mark(@Req() req: any, @Body() body: { batchId: string; date?: string; entries: { studentId: string; status: string }[]; overrideReason?: string }) {
    const { batchId, entries } = body;
    if (!batchId || !entries?.length) throw new BadRequestException('batchId and entries are required');
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new BadRequestException('Unknown batch');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== batch.unitId) throw new ForbiddenException('Cross-unit access denied');

    const d = body.date || new Date().toISOString().slice(0, 10);
    const { lockAt, absenceMsgAt } = lockTimes(d, batch.startTime);
    const now = new Date();
    const isLate = now > lockAt;
    if (isLate) {
      if (!OVERRIDE_ROLES.includes(req.user.role)) {
        throw new ForbiddenException(`Attendance locked at ${lockAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (start + 30 min). Ask your Centre Head to override.`);
      }
      if (!body.overrideReason?.trim()) throw new BadRequestException('Post-lock changes require an override reason (audited)');
    }

    for (const e of entries) {
      if (!['PRESENT', 'ABSENT', 'LEAVE'].includes(e.status)) throw new BadRequestException(`Invalid status ${e.status}`);
      await this.prisma.attendanceRecord.upsert({
        where: { studentId_date_batchId: { studentId: e.studentId, date: new Date(d), batchId } },
        update: {
          status: e.status as any, markedById: req.user.sub, markedAt: now,
          isLocked: isLate, lockTime: lockAt,
          ...(isLate ? { overrideById: req.user.sub, overrideReason: body.overrideReason } : {}),
        },
        create: {
          studentId: e.studentId, batchId, unitId: batch.unitId, date: new Date(d),
          status: e.status as any, markedById: req.user.sub, markedAt: now,
          isLocked: isLate, lockTime: lockAt,
          ...(isLate ? { overrideById: req.user.sub, overrideReason: body.overrideReason } : {}),
        },
      });
    }
    await this.audit.log(req, 'attendance_records', `${batchId}:${d}`, 'UPDATE', null, {
      marked: entries.length, late: isLate, reason: body.overrideReason ?? null,
    });

    // ── Queue the absence scan at lock + 30 min (or immediately if past) ──
    const delay = Math.max(0, absenceMsgAt.getTime() - now.getTime());
    await bbQueue.add('absence-scan', { batchId, date: d }, { delay, jobId: `absence-${batchId}-${d}` }).catch(() => null);

    return { ok: true, marked: entries.length, locked: isLate, absenceScanAt: absenceMsgAt };
  }

  // ── Day summary (per unit) ──
  @Get('summary')
  async summary(@Req() req: any, @Query('date') date?: string, @Query('unitId') unitId?: string) {
    const d = new Date(date || new Date().toISOString().slice(0, 10));
    const scope = unitScope(req.user, unitId);
    const batches = await this.prisma.batch.findMany({
      where: { isActive: true, ...scope },
      include: { unit: { select: { code: true } }, programme: { select: { name: true, levelColour: true } }, _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
      orderBy: [{ unitId: 'asc' }, { startTime: 'asc' }],
    });
    const recs = await this.prisma.attendanceRecord.groupBy({
      by: ['batchId', 'status'], where: { date: d, ...scope }, _count: true,
    });
    const agg = new Map<string, any>();
    for (const r of recs) {
      const a = agg.get(r.batchId) ?? { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      a[r.status] = (r as any)._count; agg.set(r.batchId, a);
    }
    return batches.map(b => {
      const a = agg.get(b.id) ?? { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
      const { lockAt } = lockTimes(d.toISOString().slice(0, 10), b.startTime);
      return {
        batchId: b.id, name: b.name, unit: b.unit.code, programme: b.programme,
        startTime: b.startTime, lockAt, locked: new Date() > lockAt,
        total: b._count.students, present: a.PRESENT, absent: a.ABSENT, leave: a.LEAVE,
        marked: a.PRESENT + a.ABSENT + a.LEAVE,
      };
    });
  }

  // ── Message queue view (absence alerts, escalations, admin calls) ──
  @Get('messages')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  messages(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role) ? (unitId ? { unitId } : {}) : { unitId: req.user.unitId };
    return this.prisma.messageLog.findMany({
      where: { ...scope, type: { in: ['ABSENCE_ALERT', 'ESCALATION_3DAY', 'ADMIN_CALL'] } },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
}

@Module({
  controllers: [AttendanceController],
  providers: [PrismaService, AuditService],
})
export class AttendanceModule {}

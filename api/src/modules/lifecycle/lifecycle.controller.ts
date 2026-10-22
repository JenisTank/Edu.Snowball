import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { unitScope } from '../../common/auth/unit-scope';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  canPromote,
  mergePayload,
  nextProgramme,
  promotionRecord,
  readinessReport,
  schemaFor,
  validateTabPayload,
} from './lifecycle.rules';

export const LIFECYCLE_TABS = [
  ['STUDENT_INFORMATION', 'Student Information', 'STAFF_PARENT'],
  ['FAMILY_HISTORY', 'Family History', 'STAFF_PARENT'],
  ['SIBLINGS', 'Siblings Details', 'STAFF_PARENT'],
  ['PARENT_FEEDBACK', 'Parent Feedback & Queries', 'STAFF_PARENT'],
  ['INFIRMARY', 'Infirmary', 'STAFF_ONLY'],
  ['VACCINATION', 'Vaccination', 'STAFF_PARENT'],
  ['GROWTH', 'Height & Weight', 'STAFF_PARENT'],
  ['HEALTH_MEDICAL', 'Health & Medical', 'STAFF_ONLY'],
  ['DOCUMENTS', 'Documents Vault', 'STAFF_PARENT'],
  ['FEES', 'Fees Details', 'STAFF_PARENT'],
  ['TC_INFORMATION', 'TC Information', 'STAFF_ONLY'],
  ['ATTENDANCE', 'Attendance', 'STAFF_PARENT'],
  ['PARENT_COMMUNICATION', 'Parent Communication', 'STAFF_PARENT'],
  ['LEAVE_APPLICATION', 'Leave Application', 'STAFF_PARENT'],
  ['CHILD_SUPPORT', 'Child Support Log', 'INTERNAL'],
  ['IEP', 'IEP', 'INTERNAL'],
  ['HOME_PLAN', 'Home Plan', 'STAFF_PARENT'],
  ['WORKSHEETS_PORTFOLIO', 'Worksheets / BuzzPortfolio', 'STAFF_PARENT'],
] as const;
const INTERNAL = new Set(['CHILD_SUPPORT', 'IEP']);
const STAFF_ONLY = new Set(['INFIRMARY', 'HEALTH_MEDICAL', 'TC_INFORMATION']);

@Controller('lifecycle')
@UseGuards(AuthGuard)
export class LifecycleController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get('tabs') tabs() {
    // The schema travels with the tab so the UI renders a real form, not a
    // free-text JSON box.
    return LIFECYCLE_TABS.map(([id, label, visibility]) => ({
      id,
      label,
      visibility,
      parentVisible: visibility === 'STAFF_PARENT',
      fields: schemaFor(id) ?? [],
    }));
  }
  @Get('students') students(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.student.findMany({
      where: unitScope(req.user, unitId),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        unitId: true,
        programme: { select: { name: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }
  private async student(req: any, id: string) {
    const s = await this.prisma.student.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    if (!HO_ROLES.includes(req.user.role) && s.unitId !== req.user.unitId)
      throw new ForbiddenException('Student is outside your unit');
    return s;
  }
  @Get('student/:id') async records(
    @Req() req: any,
    @Param('id') id: string,
    @Query('tab') tab?: string,
  ) {
    await this.student(req, id);
    return this.prisma.studentLifecycleRecord.findMany({
      where: { studentId: id, ...(tab ? { tab } : {}) },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
  @Post('student/:id') async create(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    const s = await this.student(req, id);
    const def = LIFECYCLE_TABS.find((x) => x[0] === b.tab);
    if (!def) throw new BadRequestException('Invalid lifecycle tab');
    if ((INTERNAL.has(b.tab) || STAFF_ONLY.has(b.tab)) && req.user.role === 'RECEPTIONIST')
      throw new ForbiddenException('Restricted student record');
    if (!b.title?.trim()) throw new BadRequestException('Title is required');
    const errors = validateTabPayload(b.tab, b.payload ?? {});
    if (errors.length) throw new BadRequestException(errors.join('; '));
    const row = await this.prisma.studentLifecycleRecord.create({
      data: {
        studentId: id,
        unitId: s.unitId,
        tab: b.tab,
        title: b.title.trim(),
        payload: b.payload || {},
        visibility: def[2],
        status: b.status || null,
        eventDate: b.eventDate ? new Date(b.eventDate) : null,
        createdById: req.user.sub,
      },
    });
    await this.audit.log(req, 'student_lifecycle_records', row.id, 'INSERT', null, row);
    return row;
  }
  @Patch(':recordId') async update(
    @Req() req: any,
    @Param('recordId') recordId: string,
    @Body() b: any,
  ) {
    const old = await this.prisma.studentLifecycleRecord.findUnique({ where: { id: recordId } });
    if (!old) throw new NotFoundException();
    await this.student(req, old.studentId);
    if (b.payload !== undefined) {
      const merged = mergePayload(old.payload, b.payload);
      const errors = validateTabPayload(old.tab, merged);
      if (errors.length) throw new BadRequestException(errors.join('; '));
    }
    const row = await this.prisma.studentLifecycleRecord.update({
      where: { id: recordId },
      data: {
        title: b.title?.trim() || old.title,
        payload: (b.payload === undefined
          ? old.payload
          : mergePayload(old.payload, b.payload)) as any,
        status: b.status === undefined ? old.status : b.status,
        eventDate: b.eventDate ? new Date(b.eventDate) : old.eventDate,
      },
    });
    await this.audit.log(req, 'student_lifecycle_records', recordId, 'UPDATE', old, row);
    return row;
  }
  @Delete(':recordId') @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD') async remove(
    @Req() req: any,
    @Param('recordId') recordId: string,
  ) {
    const old = await this.prisma.studentLifecycleRecord.findUnique({ where: { id: recordId } });
    if (!old) throw new NotFoundException();
    await this.student(req, old.studentId);
    await this.prisma.studentLifecycleRecord.delete({ where: { id: recordId } });
    await this.audit.log(req, 'student_lifecycle_records', recordId, 'DELETE', old, null);
    return { ok: true };
  }

  // ── Grade transitions (K2 → Grade 1, or one rung up the ladder) ──
  @Get('readiness/:studentId')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'TEACHER')
  async readiness(@Req() req: any, @Param('studentId') studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { programme: true, batch: true },
    });
    if (!student) throw new NotFoundException();
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new ForbiddenException('Student is outside your unit');

    const ayStart = new Date(`${student.academicYear.slice(0, 4)}-04-01T00:00:00Z`);
    const [
      attendance,
      txns,
      ptmTotal,
      ptmAttended,
      portfolio,
      homePlan,
      support,
      structure,
      addons,
    ] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { studentId, date: { gte: ayStart } },
        _count: true,
      }),
      this.prisma.feeTransaction.findMany({ where: { studentId, isCancelled: false } }),
      this.prisma.ptmRecord.count({ where: { studentId } }),
      this.prisma.ptmRecord.count({ where: { studentId, attended: true } }),
      this.prisma.studentLifecycleRecord.count({
        where: { studentId, tab: 'WORKSHEETS_PORTFOLIO' },
      }),
      this.prisma.studentLifecycleRecord.count({ where: { studentId, tab: 'HOME_PLAN' } }),
      this.prisma.studentLifecycleRecord.count({
        where: { studentId, tab: 'CHILD_SUPPORT', status: { not: 'CLOSED' } },
      }),
      this.prisma.feeStructure.findUnique({
        where: {
          unitId_programmeId_academicYear: {
            unitId: student.unitId,
            programmeId: student.programmeId!,
            academicYear: student.academicYear,
          },
        },
      }),
      this.prisma.feeAddon.findMany({ where: { studentId, status: 'PENDING' } }),
    ]);

    const present = attendance.find((a: any) => a.status === 'PRESENT')?._count ?? 0;
    const total = attendance.reduce((s: number, a: any) => s + ((a as any)._count ?? 0), 0);
    const paid = txns
      .filter((t: any) => t.ledgerType === 'PRESCHOOL')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const gross = Number(structure?.totalFee ?? 0);
    const discount = student.siblingGroup
      ? Math.round((gross * Number(structure?.siblingDiscountPct ?? 0)) / 100)
      : 0;
    const addonDue = addons.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    const report = readinessReport({
      programmeCode: student.programme?.code ?? '',
      attendancePresent: present,
      attendanceTotal: total,
      feeBalance: Math.max(0, gross - discount - paid) + addonDue,
      ptmAttended,
      ptmTotal,
      portfolioEntries: portfolio,
      homePlanEntries: homePlan,
      openChildSupport: support,
    });

    return {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        programme: student.programme?.name ?? null,
        programmeCode: student.programme?.code ?? null,
        batch: student.batch?.name ?? null,
        academicYear: student.academicYear,
      },
      ...report,
      nextProgramme: nextProgramme(student.programme?.code ?? ''),
      openChildSupportCases: support,
      pendingAddons: addons.length,
      addonDue,
    };
  }

  @Post('students/:id/promote')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async promote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: { programmeId: string; batchId?: string; effectiveDate?: string; note?: string },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { programme: true },
    });
    if (!student) throw new NotFoundException();
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new ForbiddenException('Student is outside your unit');
    if (!b?.programmeId) throw new BadRequestException('Target programme is required');

    const target = await this.prisma.programme.findUnique({ where: { id: b.programmeId } });
    if (!target) throw new BadRequestException('Unknown programme');
    if (student.programme?.code && !canPromote(student.programme.code, target.code))
      throw new BadRequestException(
        `A child in ${student.programme.code} can only move to ${nextProgramme(student.programme.code) ?? 'graduation'}`,
      );

    let batchId: string | null = null;
    if (b.batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: b.batchId } });
      if (!batch || batch.unitId !== student.unitId)
        throw new BadRequestException("Pick a batch of the student's unit");
      if (batch.programmeId !== target.id)
        throw new BadRequestException('The batch does not belong to the target programme');
      batchId = batch.id;
    }

    const record = promotionRecord(student.programme?.code ?? '—', target.code, b.note);
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const s = await tx.student.update({
        where: { id },
        data: { programmeId: target.id, ...(batchId ? { batchId } : {}) },
      });
      await tx.studentLifecycleRecord.create({
        data: {
          studentId: id,
          unitId: student.unitId,
          tab: record.tab,
          title: record.title,
          status: record.status,
          payload: record.payload,
          visibility: 'STAFF_PARENT',
          eventDate: b.effectiveDate ? new Date(`${b.effectiveDate}T00:00:00Z`) : new Date(),
          createdById: req.user.sub,
        },
      });
      return s;
    });
    await this.audit.log(
      req,
      'students',
      id,
      'UPDATE',
      {
        programmeId: student.programmeId,
        batchId: student.batchId,
      },
      {
        programmeId: target.id,
        batchId,
        effectiveDate: b.effectiveDate ?? null,
      },
    );
    return { ok: true, student: updated, transition: record };
  }
}

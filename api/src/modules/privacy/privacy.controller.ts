import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { encryptionEnabled } from '../../common/crypto/pii.service';
import {
  CONSENT_TYPES,
  DEFAULT_RETENTION,
  RETAINED_ON_ERASURE,
  anonymisedStudent,
  consentRegister,
  retentionPlan,
} from './privacy.rules';
import { RETENTION_KEY, runRetention } from './retention.service';
import {
  ConsentRecordDto,
  EraseStudentDto,
  RetentionPolicyDto,
  RetentionPurgeDto,
} from './privacy.dto';

/**
 * DPDP compliance surface.
 *
 *  - consent register (append-only, auditable)
 *  - retention policy + preview/purge
 *  - data-subject access (export) and erasure
 *
 * Every endpoint here writes an audit row: these are the actions a regulator
 * asks about first.
 */

const STAFF_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];

@Controller('privacy')
@UseGuards(AuthGuard)
export class PrivacyController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async studentFor(req: any, id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { unit: { select: { code: true, name: true } }, programme: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new BadRequestException('Student is outside your unit');
    return student;
  }

  // ── Consent register ──
  @Get('consents/:studentId')
  @Roles(...STAFF_ROLES)
  async consents(@Req() req: any, @Param('studentId') studentId: string) {
    await this.studentFor(req, studentId);
    const rows = await this.prisma.consentLog.findMany({
      where: { studentId },
      orderBy: { grantedAt: 'desc' },
    });
    return consentRegister(rows);
  }

  @Post('consents/:studentId')
  @Roles(...STAFF_ROLES)
  async recordConsent(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Body() b: ConsentRecordDto,
  ) {
    const student = await this.studentFor(req, studentId);
    if (!b?.decisions || typeof b.decisions !== 'object')
      throw new BadRequestException('decisions map is required, e.g. { "PHOTO_VIDEO": false }');
    const unknown = Object.keys(b.decisions).filter((k) => !CONSENT_TYPES.includes(k as any));
    if (unknown.length)
      throw new BadRequestException(`Unknown consent types: ${unknown.join(', ')}`);

    const created: any[] = [];
    for (const [type, granted] of Object.entries(b.decisions)) {
      created.push(
        await this.prisma.consentLog.create({
          data: {
            studentId,
            consentType: type,
            granted: !!granted,
            grantedBy: b.grantedBy?.trim() || student.fatherName || student.motherName || 'Parent',
          },
        }),
      );
    }
    await this.audit.log(req, 'consent_log', studentId, 'INSERT', null, {
      decisions: b.decisions,
    });
    return { ok: true, recorded: created.length };
  }

  // ── Compliance summary (the founder's dashboard) ──
  @Get('summary')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async summary(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const students = await this.prisma.student.findMany({
      where: { status: { in: ['ACTIVE', 'REGISTERED'] }, ...scope },
      select: { id: true, anonymisedAt: true },
    });
    const ids = students.map((s: any) => s.id);
    const consents = await this.prisma.consentLog.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, consentType: true, granted: true, grantedAt: true },
    });
    const byStudent = new Map<string, any[]>();
    for (const c of consents) {
      const list = byStudent.get(c.studentId) ?? [];
      list.push(c);
      byStudent.set(c.studentId, list);
    }
    let missingDataProcessing = 0;
    let photoRefused = 0;
    for (const s of students) {
      const reg = consentRegister(byStudent.get(s.id) ?? []);
      if (!reg.mandatorySatisfied) missingDataProcessing += 1;
      if (reg.latest.PHOTO_VIDEO && !reg.latest.PHOTO_VIDEO.granted) photoRefused += 1;
    }
    const policy = (await this.prisma.appSetting.findUnique({ where: { key: RETENTION_KEY } }))
      ?.value;
    return {
      students: students.length,
      consentRecords: consents.length,
      missingDataProcessing,
      photoRefused,
      erased: students.filter((s: any) => !!s.anonymisedAt).length,
      piiEncrypted: encryptionEnabled(),
      retention: retentionPlan((policy as any) ?? {}).policy,
      defaults: DEFAULT_RETENTION,
    };
  }

  @Get('retention')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async retention(@Req() req: any) {
    const preview = await runRetention(this.prisma, { dryRun: true });
    return preview;
  }

  @Post('retention/policy')
  @Roles('FOUNDER')
  async setPolicy(@Req() req: any, @Body() b: RetentionPolicyDto) {
    const allowed = ['messageDays', 'conversationDays', 'pushDays', 'auditDays', 'studentDays'];
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(b ?? {})) {
      if (!allowed.includes(k)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 30 || n > 36500)
        throw new BadRequestException(`${k} must be between 30 and 36500 days`);
      clean[k] = n;
    }
    if (!Object.keys(clean).length)
      throw new BadRequestException('No valid policy fields supplied');
    const row = await this.prisma.appSetting.upsert({
      where: { key: RETENTION_KEY },
      update: { value: clean, updatedById: req.user.sub },
      create: { key: RETENTION_KEY, value: clean, updatedById: req.user.sub },
    });
    await this.audit.log(req, 'app_settings', RETENTION_KEY, 'UPDATE', null, clean);
    return row;
  }

  @Post('retention/run')
  @Roles('FOUNDER')
  async purge(@Req() req: any, @Body() b: RetentionPurgeDto) {
    const dryRun = b?.dryRun !== false;
    if (!dryRun && b?.confirm !== 'PURGE')
      throw new BadRequestException('Live purge requires { "confirm": "PURGE" }');
    const result = await runRetention(this.prisma, { dryRun });
    await this.audit.log(req, 'privacy_retention', 'retention-run', 'DELETE', null, {
      dryRun,
      purged: result.purged,
    });
    return result;
  }

  // ── Data-subject access: everything held about one child ──
  @Get('students/:id/export')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async export(@Req() req: any, @Param('id') id: string) {
    const student = await this.studentFor(req, id);
    const [attendance, fees, consents, certificates, lifecycle, messages, leaves, addons, ptm] =
      await Promise.all([
        this.prisma.attendanceRecord.findMany({
          where: { studentId: id },
          orderBy: { date: 'asc' },
        }),
        this.prisma.feeTransaction.findMany({
          where: { studentId: id },
          orderBy: { paymentDate: 'asc' },
        }),
        this.prisma.consentLog.findMany({
          where: { studentId: id },
          orderBy: { grantedAt: 'asc' },
        }),
        this.prisma.certificate.findMany({ where: { studentId: id } }),
        this.prisma.studentLifecycleRecord.findMany({ where: { studentId: id } }),
        this.prisma.parentMessage.findMany({
          where: { studentId: id },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.studentLeave.findMany({
          where: { studentId: id },
          orderBy: { fromDate: 'asc' },
        }),
        this.prisma.feeAddon.findMany({ where: { studentId: id } }),
        this.prisma.ptmRecord.findMany({ where: { studentId: id } }),
      ]);

    const bundle = {
      generatedAt: new Date().toISOString(),
      legalBasis: 'DPDP Act 2023 — data principal access request (section 11)',
      subject: {
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        dob: student.dob,
        gender: student.gender,
        programme: student.programme?.name ?? null,
        unit: student.unit.name,
        status: student.status,
        admissionDate: student.admissionDate,
        academicYear: student.academicYear,
        guardians: {
          fatherName: student.fatherName,
          fatherPhone: student.fatherPhone,
          motherName: student.motherName,
          motherPhone: student.motherPhone,
          email: student.guardianEmail,
        },
        addressArea: student.addressArea,
        // Health data is disclosed only under the MEDICAL consent.
        health: consents.some((c: any) => c.consentType === 'MEDICAL' && c.granted)
          ? {
              bloodGroup: student.bloodGroup,
              allergies: student.allergies,
              medicalNotes: student.medicalNotes,
            }
          : 'withheld — no MEDICAL consent on record',
      },
      attendance,
      fees,
      feeAddons: addons,
      leaves,
      certificates,
      lifecycle,
      ptm,
      conversations: messages,
      consents,
    };
    await this.audit.log(req, 'students', id, 'UPDATE', null, {
      action: 'DPDP_EXPORT',
      sections: Object.keys(bundle),
    });
    return bundle;
  }

  /**
   * Erasure. Financial and audit records are retained (tax and education law),
   * everything identifying the child is overwritten.
   */
  @Delete('students/:id')
  @Roles('FOUNDER')
  async erase(@Req() req: any, @Param('id') id: string, @Body() b: EraseStudentDto) {
    if (b?.confirm !== 'ERASE')
      throw new BadRequestException('Erasure requires { "confirm": "ERASE", "reason": "..." }');
    if (!b?.reason?.trim())
      throw new BadRequestException('A reason is required for the erasure log');
    const student = await this.studentFor(req, id);

    const erased = anonymisedStudent(student);
    await this.prisma.$transaction(async (tx: any) => {
      await tx.student.update({ where: { id }, data: erased });
      // Threads, push subscriptions and queued messages identify the family.
      await tx.parentMessage.deleteMany({ where: { studentId: id } });
      await tx.messageLog.deleteMany({ where: { studentId: id } });
      await tx.pushSubscription.deleteMany({
        where: {
          phone: {
            in: [student.fatherPhone, student.motherPhone].filter(Boolean) as string[],
          },
        },
      });
      await tx.consentLog.create({
        data: {
          studentId: id,
          consentType: 'DATA_PROCESSING',
          granted: false,
          grantedBy: `DPDP erasure — ${b.reason!.trim()}`,
        },
      });
    });

    await this.audit.log(
      req,
      'students',
      id,
      'DELETE',
      { admissionNo: student.admissionNo },
      {
        action: 'DPDP_ERASURE',
        reason: b.reason,
        retained: RETAINED_ON_ERASURE,
      },
    );
    return {
      ok: true,
      studentId: id,
      admissionNo: student.admissionNo,
      anonymisedAt: erased.anonymisedAt,
      retained: RETAINED_ON_ERASURE,
    };
  }
}

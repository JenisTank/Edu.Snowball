import {
  Body, Controller, Get, Module, Param, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';
import { STUDENT_PII_FIELDS, decryptStudentPII, encryptPII, isEncrypted, piiEnabled } from '../common/pii';

// ─────────────────────────────────────────────────────────────
// DPDP compliance (Slice 7 hardening)
//   · consent log — recorded at admission, viewable + revocable
//   · PII encryption at rest — status + one-shot backfill
//   · retention configuration — how long each record class is kept
//   · subject access export — everything held about one child, in one JSON
// ─────────────────────────────────────────────────────────────

const DPO_ROLES = ['FOUNDER', 'ACADEMIC_DIR']; // data-protection owners at HO
const CONSENT_TYPES = ['ADMISSION_FORM', 'PHOTO_VIDEO', 'DATA_PROCESSING', 'WHATSAPP_UPDATES', 'MEDICAL_EMERGENCY'];

// Defaults applied until HO saves its own policy (stored in system_settings).
export const DEFAULT_RETENTION = {
  auditLogDays: 2555,        // 7 years — statutory
  messageLogDays: 365,
  leadLostDays: 730,         // lost enquiries purged after 2 years
  attendanceDays: 2555,
  exStudentDays: 1825,       // 5 years after TC / graduation
  pushSubscriptionDays: 180,
};
const RETENTION_KEY = 'dpdp.retention';

@Controller('dpdp')
@UseGuards(AuthGuard)
export class DpdpController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── Compliance dashboard ──
  @Get('status')
  @Roles(...DPO_ROLES)
  async status() {
    const [students, consents, pushSubs, auditRows, messages] = await Promise.all([
      this.prisma.student.findMany({ select: { id: true, bloodGroup: true, allergies: true, medicalNotes: true } }),
      this.prisma.consentLog.count(),
      this.prisma.pushSubscription.count(),
      this.prisma.auditLog.count(),
      this.prisma.messageLog.count(),
    ]);
    let withPII = 0, encrypted = 0;
    for (const s of students) {
      const vals = STUDENT_PII_FIELDS.map(f => (s as any)[f]).filter(Boolean);
      if (!vals.length) continue;
      withPII++;
      if (vals.every(v => isEncrypted(v))) encrypted++;
    }
    const studentsWithConsent = await this.prisma.consentLog.findMany({ select: { studentId: true }, distinct: ['studentId'] });
    return {
      encryption: {
        enabled: piiEnabled(),
        fields: STUDENT_PII_FIELDS,
        recordsWithPII: withPII,
        recordsEncrypted: encrypted,
        pending: withPII - encrypted,
        note: piiEnabled() ? null : 'Set PII_ENCRYPTION_KEY in .env to switch encryption on.',
      },
      consent: {
        totalRecords: consents,
        studentsCovered: studentsWithConsent.length,
        studentsTotal: students.length,
        types: CONSENT_TYPES,
      },
      retention: await this.retention(),
      volumes: { auditLog: auditRows, messageLog: messages, pushSubscriptions: pushSubs },
    };
  }

  // ── Consent log ──
  @Get('consents')
  async consents(@Req() req: any, @Query('studentId') studentId?: string) {
    if (studentId) {
      const s = await this.prisma.student.findUnique({ where: { id: studentId }, select: { unitId: true } });
      if (!s) throw new NotFoundException('Student not found');
      if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');
      return this.prisma.consentLog.findMany({ where: { studentId }, orderBy: { grantedAt: 'desc' } });
    }
    if (!HO_ROLES.includes(req.user.role)) throw new ForbiddenException('HO only');
    return this.prisma.consentLog.findMany({ orderBy: { grantedAt: 'desc' }, take: 300 });
  }

  // Record (or revoke) a consent. Revocation is an append — history is kept.
  @Post('consents')
  async record(@Req() req: any, @Body() b: { studentId: string; consentType: string; granted: boolean; grantedBy: string }) {
    if (!b?.studentId || !b?.consentType) throw new BadRequestException('studentId and consentType are required');
    if (!CONSENT_TYPES.includes(b.consentType)) throw new BadRequestException(`consentType must be one of ${CONSENT_TYPES.join(', ')}`);
    const s = await this.prisma.student.findUnique({ where: { id: b.studentId }, select: { unitId: true, fatherName: true, motherName: true } });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');
    const row = await this.prisma.consentLog.create({
      data: {
        studentId: b.studentId, consentType: b.consentType, granted: !!b.granted,
        grantedBy: b.grantedBy?.trim() || s.fatherName || s.motherName || 'Parent',
      },
    });
    await this.audit.log(req, 'consent_log', row.id, 'CREATE', null, row);
    return row;
  }

  // ── Retention policy ──
  @Get('retention')
  async retention() {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: RETENTION_KEY } });
    return { ...DEFAULT_RETENTION, ...((row?.value as any) ?? {}) };
  }

  @Post('retention')
  @Roles(...DPO_ROLES)
  async setRetention(@Req() req: any, @Body() b: Record<string, number>) {
    const next: Record<string, number> = { ...DEFAULT_RETENTION };
    for (const k of Object.keys(DEFAULT_RETENTION)) {
      if (b[k] != null) {
        const v = Number(b[k]);
        if (!Number.isFinite(v) || v < 1) throw new BadRequestException(`${k} must be a positive number of days`);
        next[k] = Math.round(v);
      }
    }
    const before = await this.prisma.systemSetting.findUnique({ where: { key: RETENTION_KEY } });
    const row = await this.prisma.systemSetting.upsert({
      where: { key: RETENTION_KEY },
      create: { key: RETENTION_KEY, value: next, description: 'DPDP retention windows (days)', updatedById: req.user.sub },
      update: { value: next, updatedById: req.user.sub },
    });
    await this.audit.log(req, 'system_settings', RETENTION_KEY, before ? 'UPDATE' : 'CREATE', before?.value ?? null, next);
    return row.value;
  }

  // Purge anything past its retention window. Dry-run by default — the
  // counts are shown first, and only `{confirm:true}` actually deletes.
  @Post('retention/run')
  @Roles(...DPO_ROLES)
  async runRetention(@Req() req: any, @Body() b: { confirm?: boolean }) {
    const policy: any = await this.retention();
    const ago = (days: number) => new Date(Date.now() - days * 86400_000);
    const targets = {
      auditLog: { where: { changedAt: { lt: ago(policy.auditLogDays) } } },
      messageLog: { where: { createdAt: { lt: ago(policy.messageLogDays) } } },
      lead: { where: { stage: 'LOST' as const, updatedAt: { lt: ago(policy.leadLostDays) } } },
      pushSubscription: { where: { createdAt: { lt: ago(policy.pushSubscriptionDays) }, lastUsedAt: null } },
    };
    const counts: Record<string, number> = {};
    for (const [model, args] of Object.entries(targets)) {
      counts[model] = await (this.prisma as any)[model].count(args);
    }
    if (!b?.confirm) return { dryRun: true, policy, wouldDelete: counts };
    const deleted: Record<string, number> = {};
    for (const [model, args] of Object.entries(targets)) {
      deleted[model] = (await (this.prisma as any)[model].deleteMany(args)).count;
    }
    await this.audit.log(req, 'system_settings', 'retention.run', 'DELETE', null, deleted);
    return { dryRun: false, deleted };
  }

  // ── PII encryption backfill (safe to re-run) ──
  @Post('encrypt-backfill')
  @Roles(...DPO_ROLES)
  async backfill(@Req() req: any) {
    if (!piiEnabled()) throw new BadRequestException('PII_ENCRYPTION_KEY is not configured');
    const rows = await this.prisma.student.findMany({
      select: { id: true, bloodGroup: true, allergies: true, medicalNotes: true },
    });
    let updated = 0;
    for (const r of rows) {
      const data: any = {};
      for (const f of STUDENT_PII_FIELDS) {
        const v = (r as any)[f];
        if (v && !isEncrypted(v)) data[f] = encryptPII(v);
      }
      if (Object.keys(data).length) {
        await this.prisma.student.update({ where: { id: r.id }, data });
        updated++;
      }
    }
    await this.audit.log(req, 'students', 'pii.backfill', 'UPDATE', null, { updated });
    return { ok: true, updated };
  }

  // ── Subject access request: everything held about one child ──
  @Get('export/:studentId')
  @Roles(...DPO_ROLES)
  async exportChild(@Param('studentId') studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { programme: true, batch: true, unit: { select: { code: true, name: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    const [attendance, fees, payments, documents, messages, thread, consents, certificates] = await Promise.all([
      this.prisma.attendanceRecord.findMany({ where: { studentId }, orderBy: { date: 'asc' } }),
      this.prisma.feeTransaction.findMany({ where: { studentId }, orderBy: { paymentDate: 'asc' } }),
      this.prisma.paymentOrder.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.document.findMany({ where: { studentId }, select: { id: true, type: true, title: true, fileName: true, visibility: true, createdAt: true } }),
      this.prisma.messageLog.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.parentMessage.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.consentLog.findMany({ where: { studentId } }),
      this.prisma.certificate.findMany({ where: { studentId } }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      notice: 'DPDP subject-access export. Discovery Flight assessments are internal records and are excluded.',
      student: decryptStudentPII(student as any),
      attendance, fees, payments, documents, messages, thread, consents, certificates,
    };
  }
}

@Module({ controllers: [DpdpController], providers: [PrismaService, AuditService] })
export class DpdpModule {}

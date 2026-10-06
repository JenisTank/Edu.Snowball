import {
  Body, Controller, Get, Module, Param, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { encryptPII } from '../common/pii';
import { AuditService } from './admin.controller';

const AY = '2026-27';
const AY_SHORT = '2627';
const ADMIT_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'RECEPTIONIST', 'COORDINATOR'];

// Instalment plan auto-suggestion by joining window (spec):
// Apr–Jul → Plan A (3 inst.) · Aug–Nov → Plan B (2 inst.) · Dec–Mar → Plan C (full)
export function suggestPlan(date = new Date()): 'PLAN_A' | 'PLAN_B' | 'PLAN_C' {
  const m = date.getMonth() + 1; // 1-12
  if (m >= 4 && m <= 7) return 'PLAN_A';
  if (m >= 8 && m <= 11) return 'PLAN_B';
  return 'PLAN_C';
}

@Controller()
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextSerial(prefix: string) {
    const last = await this.prisma.student.findFirst({ where: { admissionNo: { startsWith: prefix } }, orderBy: { admissionNo: 'desc' } });
    return last ? parseInt(last.admissionNo.slice(prefix.length), 10) + 1 : 1;
  }

  // ── Admissions pipeline (REGISTERED students + their Discovery Flights) ──
  @Get('admissions')
  @Roles(...ADMIT_ROLES)
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.student.findMany({
      where: { status: 'REGISTERED', ...unitScope(req.user, unitId) },
      include: {
        unit: { select: { code: true, name: true } },
        programme: true,
        lead: { select: { id: true, inquiryNo: true, stage: true, areaLocality: true } },
        discoveryFlights: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Stage-2 Registration (lead-linked) ──
  @Post('leads/:leadId/register')
  @Roles(...ADMIT_ROLES)
  async register(@Req() req: any, @Param('leadId') leadId: string, @Body() body: any) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, include: { student: true, assignedUnit: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.student) throw new BadRequestException(`Already registered as ${lead.student.admissionNo}`);
    if (!lead.assignedUnitId) throw new BadRequestException('Route the lead to a unit before registration');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== lead.assignedUnitId) throw new ForbiddenException('Lead is assigned to another unit');

    const { firstName, lastName, dob, gender, fatherName, fatherPhone, motherName, motherPhone, addressArea, programmeId, bloodGroup, allergies } = body;
    if (!firstName || !lastName || !dob || !programmeId) throw new BadRequestException('firstName, lastName, dob and programmeId are required');

    // ── Sibling detection: any existing student sharing a parent phone ──
    const phones = [fatherPhone, motherPhone, lead.parentPhone].filter(Boolean);
    const sibling = phones.length ? await this.prisma.student.findFirst({
      where: { OR: phones.flatMap(p => [{ fatherPhone: p }, { motherPhone: p }]) },
    }) : null;
    const siblingGroup = sibling ? (sibling.siblingGroup ?? sibling.id) : null;
    if (sibling && !sibling.siblingGroup) {
      await this.prisma.student.update({ where: { id: sibling.id }, data: { siblingGroup } });
    }

    const unitCode = lead.assignedUnit!.code;
    const regPrefix = `BB-${unitCode}-REG-${AY_SHORT}-`;
    const admissionNo = `${regPrefix}${String(await this.nextSerial(regPrefix)).padStart(4, '0')}`;

    const student = await this.prisma.student.create({
      data: {
        unitId: lead.assignedUnitId, admissionNo, status: 'REGISTERED',
        firstName, lastName, dob: new Date(dob), gender: gender || null,
        fatherName: fatherName || null, fatherPhone: fatherPhone || null,
        motherName: motherName || null, motherPhone: motherPhone || null,
        addressArea: addressArea || lead.areaLocality,
        // sensitive fields are encrypted at rest (DPDP) — see common/pii.ts
        bloodGroup: encryptPII(bloodGroup || null), allergies: encryptPII(allergies || null),
        programmeId, academicYear: AY,
        instalmentPlan: suggestPlan(),
        siblingGroup, leadId: lead.id,
      },
      include: { programme: true, unit: { select: { code: true } } },
    });
    await this.prisma.lead.update({ where: { id: leadId }, data: { stage: 'DISCOVERY_FLIGHT' } });
    await this.prisma.leadActivity.create({
      data: { leadId, type: 'REGISTRATION', byId: req.user.sub, note: `Registered as ${admissionNo}`, meta: { suggestedPlan: student.instalmentPlan, sibling: !!sibling } },
    });
    await this.audit.log(req, 'students', student.id, 'INSERT', null, { admissionNo, leadId, sibling: !!sibling });
    return { ...student, siblingDetected: !!sibling, siblingOf: sibling ? `${sibling.firstName} ${sibling.lastName} (${sibling.admissionNo})` : null };
  }

  // ── Discovery Flight: schedule ──
  @Post('students/:id/discovery')
  @Roles(...ADMIT_ROLES)
  async scheduleDF(@Req() req: any, @Param('id') id: string, @Body() body: { scheduledAt?: string }) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId) throw new ForbiddenException('Cross-unit access denied');
    const df = await this.prisma.discoveryFlight.create({
      data: {
        studentId: id, leadId: student.leadId, unitId: student.unitId,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
        internalOnly: true,
      },
    });
    await this.audit.log(req, 'discovery_flights', df.id, 'INSERT', null, { studentId: id });
    return df;
  }

  // ── Discovery Flight: record result (EP/GP/SP/NP/ND — internal only) ──
  @Post('discovery/:dfId/result')
  @Roles(...ADMIT_ROLES)
  async recordDF(@Req() req: any, @Param('dfId') dfId: string, @Body() body: { resultCode: string; recommendation: string; notes?: string }) {
    const df = await this.prisma.discoveryFlight.findUnique({ where: { id: dfId } });
    if (!df) throw new NotFoundException('Discovery Flight not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== df.unitId) throw new ForbiddenException('Cross-unit access denied');
    if (!['EP', 'GP', 'SP', 'NP', 'ND'].includes(body.resultCode)) throw new BadRequestException('resultCode must be EP/GP/SP/NP/ND');
    if (!['READY', 'READY_WITH_SUPPORT', 'ALTERNATE_LEVEL'].includes(body.recommendation)) throw new BadRequestException('Invalid recommendation');
    const updated = await this.prisma.discoveryFlight.update({
      where: { id: dfId },
      data: { conductedAt: new Date(), resultCode: body.resultCode as any, recommendation: body.recommendation, notes: body.notes || null },
    });
    await this.audit.log(req, 'discovery_flights', dfId, 'UPDATE', df, { resultCode: body.resultCode, recommendation: body.recommendation });
    return updated;
  }

  // ── Discovery Flight: Centre Head approval gate ──
  @Post('discovery/:dfId/approve')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async approveDF(@Req() req: any, @Param('dfId') dfId: string) {
    const df = await this.prisma.discoveryFlight.findUnique({ where: { id: dfId } });
    if (!df) throw new NotFoundException('Discovery Flight not found');
    if (req.user.role === 'CENTRE_HEAD' && req.user.unitId !== df.unitId) throw new ForbiddenException('Centre Heads approve their own unit only');
    if (!df.resultCode) throw new BadRequestException('Record the result before approval');
    const updated = await this.prisma.discoveryFlight.update({
      where: { id: dfId }, data: { approvedById: req.user.sub, approvedAt: new Date() },
    });
    await this.audit.log(req, 'discovery_flights', dfId, 'UPDATE', null, { approved: true });
    return updated;
  }

  // ── Confirmation: admission number + batch + seat check + Enrolled ──
  @Post('students/:id/confirm')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'RECEPTIONIST')
  async confirm(@Req() req: any, @Param('id') id: string, @Body() body: { batchId: string; instalmentPlan?: string }) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { unit: true, discoveryFlights: { orderBy: { createdAt: 'desc' } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'REGISTERED') throw new BadRequestException('Student is not awaiting confirmation');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId) throw new ForbiddenException('Cross-unit access denied');

    // Gate: latest Discovery Flight must be approved by CH
    const df = student.discoveryFlights[0];
    if (!df?.approvedAt) throw new BadRequestException('Discovery Flight must be completed and approved by the Centre Head before confirmation');

    const batch = await this.prisma.batch.findUnique({ where: { id: body.batchId }, include: { _count: { select: { students: true } } } });
    if (!batch || batch.unitId !== student.unitId) throw new BadRequestException('Pick a batch of the student\'s unit');
    if (!batch.isActive) throw new BadRequestException('Batch is inactive');
    if (batch._count.students >= batch.capacity) throw new BadRequestException(`Batch is full (${batch._count.students}/${batch.capacity}) — seat tracker blocked this admission`);

    const admPrefix = `BB-${student.unit.code}-${AY_SHORT}-`;
    const admissionNo = `${admPrefix}${String(await this.nextSerial(admPrefix)).padStart(4, '0')}`;

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        admissionNo, status: 'ACTIVE', batchId: batch.id,
        admissionDate: new Date(),
        instalmentPlan: (body.instalmentPlan as any) || student.instalmentPlan || suggestPlan(),
      },
      include: { programme: true, batch: true, unit: { select: { code: true, name: true } } },
    });
    if (student.leadId) {
      await this.prisma.lead.update({ where: { id: student.leadId }, data: { stage: 'ENROLLED' } });
      await this.prisma.leadActivity.create({
        data: { leadId: student.leadId, type: 'SYSTEM', byId: req.user.sub, note: `Admission confirmed — ${admissionNo}`, meta: { batch: batch.name } },
      });
    }
    await this.audit.log(req, 'students', id, 'UPDATE', { status: 'REGISTERED', admissionNo: student.admissionNo }, { status: 'ACTIVE', admissionNo, batchId: batch.id });
    // Fee ledger + parent portal account activate in Slices 5 & 6 — flagged here
    return { ...updated, activated: { attendance: true, feeLedger: 'Slice 5', parentPortal: 'Slice 6' } };
  }
}

@Module({
  controllers: [AdmissionsController],
  providers: [PrismaService, AuditService],
})
export class AdmissionsModule {}

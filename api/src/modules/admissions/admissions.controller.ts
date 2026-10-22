import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { unitScope } from '../../common/auth/unit-scope';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PdfService } from '../../common/pdf/pdf.service';
import { sendWebPush } from '../notifications/push.service';
import { buildSchedule, num } from '../fees/fees.rules';
import { suggestPlan } from './admissions.rules';

const AY = '2026-27';
const AY_SHORT = '2627';
const ADMIT_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'RECEPTIONIST', 'COORDINATOR'];

// Instalment plan auto-suggestion by joining window (spec):
// Apr–Jul → Plan A (3 inst.) · Aug–Nov → Plan B (2 inst.) · Dec–Mar → Plan C (full)

@Controller()
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private pdf: PdfService,
  ) {}

  /**
   * The letter a parent receives at enrolment: batch, plan, fee summary and
   * the orientation date. Rendered from the same numbers as the fee ledger.
   */
  private async confirmationLetter(studentId: string, req: any) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        programme: true,
        batch: true,
        unit: true,
        feeTransactions: true,
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && s.unitId !== req.user.unitId)
      throw new ForbiddenException('Cross-unit access denied');
    if (s.status === 'REGISTERED' || !s.admissionNo.startsWith('BB-'))
      throw new BadRequestException('Confirm the admission first — there is no seat yet');

    const structure = await this.prisma.feeStructure.findUnique({
      where: {
        unitId_programmeId_academicYear: {
          unitId: s.unitId,
          programmeId: s.programmeId,
          academicYear: AY,
        },
      },
    });
    const schedule = buildSchedule(structure, s.instalmentPlan ?? 'PLAN_C', !!s.siblingGroup);
    const paid = s.feeTransactions
      .filter((t: any) => !t.isCancelled && t.ledgerType === 'PRESCHOOL')
      .reduce((a: number, t: any) => a + num(t.amount), 0);
    return {
      student: s,
      schedule,
      paid,
      balance: Math.max(0, schedule.net - paid),
      child: `${s.firstName} ${s.lastName}`,
      planLabel: String(s.instalmentPlan ?? 'PLAN_C').replace('PLAN_', 'Plan '),
    };
  }

  private letterHtml(d: Awaited<ReturnType<AdmissionsController['confirmationLetter']>>) {
    const { student: s, schedule, child } = d;
    const date = (v: any) =>
      v
        ? new Date(v).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : '—';
    const esc = (v: any) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
      );
    const rows = schedule.instalments
      .map(
        (i) =>
          `<tr><td>Instalment ${i.no}</td><td>${date(`${i.dueDate}T00:00:00Z`)}</td><td class="r">₹${i.amount.toLocaleString('en-IN')}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Admission Confirmation · ${esc(d.child)}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',system-ui,sans-serif;background:#faf7ef;color:#1F1B13;display:flex;justify-content:center;padding:36px}
      .sheet{width:760px;background:#fff;border:1px solid #E5D9B5;border-radius:14px;overflow:hidden}
      .head{background:linear-gradient(145deg,#F8EDCD,#EBDBAC);padding:26px 34px}
      .brand{font-size:24px;font-weight:800;color:#8A6410}
      .sub{font-size:12px;color:#6b5a2e;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-top:4px}
      .body{padding:30px 34px}
      h1{font-size:19px;color:#1F1B13;margin-bottom:14px}
      p{font-size:14px;line-height:1.75;color:#44403c;margin-bottom:12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin:18px 0}
      .grid div{display:flex;justify-content:space-between;font-size:13px;border-bottom:1px solid #F3EAD0;padding:6px 0}
      .grid span{color:#78716c;font-weight:600}
      table{width:100%;border-collapse:collapse;margin:14px 0}
      th,td{font-size:13px;padding:8px 0;border-bottom:1px solid #F3EAD0;text-align:left}
      th{color:#78716c;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      .r{text-align:right}
      .total{display:flex;justify-content:space-between;background:linear-gradient(145deg,#DCA93C,#A97716);color:#fff;padding:14px 18px;border-radius:10px;font-weight:800;margin-top:12px}
      .sign{margin-top:40px;display:flex;justify-content:space-between;font-size:12px;color:#57534e}
      .sign div{border-top:1px solid #a8a29e;padding-top:6px;width:200px;text-align:center}
      @media print{body{padding:0;background:#fff}.sheet{border:none}}
    </style></head><body><div class="sheet">
      <div class="head"><div class="brand">🐝 BumbleB Kidz</div><div class="sub">${esc(s.unit.name)} · Admission Confirmation</div></div>
      <div class="body">
        <h1>Welcome to the hive, ${esc(child)}!</h1>
        <p>Dear ${esc(s.fatherName || s.motherName || 'Parent')}, we are delighted to confirm ${esc(child)}'s admission for Academic Year ${esc(AY)}. This letter confirms the seat, the batch and the fee plan.</p>
        <div class="grid">
          <div><span>Admission No.</span><b>${esc(s.admissionNo)}</b></div>
          <div><span>Programme</span><b>${esc(s.programme?.name ?? '—')}</b></div>
          <div><span>Batch</span><b>${esc(s.batch?.name ?? '—')}</b></div>
          <div><span>Class timing</span><b>${esc(s.batch?.startTime ?? '—')}</b></div>
          <div><span>Admission date</span><b>${date(s.admissionDate)}</b></div>
          <div><span>Orientation</span><b>${date(s.orientationDate)}</b></div>
          <div><span>Payment plan</span><b>${esc(d.planLabel)}</b></div>
          <div><span>Sibling concession</span><b>₹${num(schedule.discount).toLocaleString('en-IN')}</b></div>
        </div>
        <table><thead><tr><th>Instalment</th><th>Due date</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total"><span>Annual fee payable</span><span>₹${num(schedule.net).toLocaleString('en-IN')}</span></div>
        <p style="margin-top:16px">Fees are payable on or before each due date. Receipts are issued for every payment and appear in the parent portal. Please bring this letter on orientation day.</p>
        <div class="sign"><div>Centre Head</div><div>Founder — BumbleB Kidz</div></div>
      </div>
    </div><script>setTimeout(()=>window.print&&window.print(),400)</script></body></html>`;
  }

  private async nextSerial(prefix: string) {
    const last = await this.prisma.student.findFirst({
      where: { admissionNo: { startsWith: prefix } },
      orderBy: { admissionNo: 'desc' },
    });
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
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { student: true, assignedUnit: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.student)
      throw new BadRequestException(`Already registered as ${lead.student.admissionNo}`);
    if (!lead.assignedUnitId)
      throw new BadRequestException('Route the lead to a unit before registration');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== lead.assignedUnitId)
      throw new ForbiddenException('Lead is assigned to another unit');

    const {
      firstName,
      lastName,
      dob,
      gender,
      fatherName,
      fatherPhone,
      motherName,
      motherPhone,
      addressArea,
      programmeId,
      bloodGroup,
      allergies,
    } = body;
    if (!firstName || !lastName || !dob || !programmeId)
      throw new BadRequestException('firstName, lastName, dob and programmeId are required');

    // ── Sibling detection: any existing student sharing a parent phone ──
    const phones = [fatherPhone, motherPhone, lead.parentPhone].filter(Boolean);
    const sibling = phones.length
      ? await this.prisma.student.findFirst({
          where: { OR: phones.flatMap((p) => [{ fatherPhone: p }, { motherPhone: p }]) },
        })
      : null;
    const siblingGroup = sibling ? (sibling.siblingGroup ?? sibling.id) : null;
    if (sibling && !sibling.siblingGroup) {
      await this.prisma.student.update({ where: { id: sibling.id }, data: { siblingGroup } });
    }

    const unitCode = lead.assignedUnit!.code;
    const regPrefix = `BB-${unitCode}-REG-${AY_SHORT}-`;
    const admissionNo = `${regPrefix}${String(await this.nextSerial(regPrefix)).padStart(4, '0')}`;

    const student = await this.prisma.student.create({
      data: {
        unitId: lead.assignedUnitId,
        admissionNo,
        status: 'REGISTERED',
        firstName,
        lastName,
        dob: new Date(dob),
        gender: gender || null,
        fatherName: fatherName || null,
        fatherPhone: fatherPhone || null,
        motherName: motherName || null,
        motherPhone: motherPhone || null,
        addressArea: addressArea || lead.areaLocality,
        bloodGroup: bloodGroup || null,
        allergies: allergies || null,
        programmeId,
        academicYear: AY,
        instalmentPlan: suggestPlan(),
        siblingGroup,
        leadId: lead.id,
      },
      include: { programme: true, unit: { select: { code: true } } },
    });
    await this.prisma.lead.update({ where: { id: leadId }, data: { stage: 'DISCOVERY_FLIGHT' } });
    await this.prisma.leadActivity.create({
      data: {
        leadId,
        type: 'REGISTRATION',
        byId: req.user.sub,
        note: `Registered as ${admissionNo}`,
        meta: { suggestedPlan: student.instalmentPlan, sibling: !!sibling },
      },
    });
    await this.audit.log(req, 'students', student.id, 'INSERT', null, {
      admissionNo,
      leadId,
      sibling: !!sibling,
    });
    return {
      ...student,
      siblingDetected: !!sibling,
      siblingOf: sibling
        ? `${sibling.firstName} ${sibling.lastName} (${sibling.admissionNo})`
        : null,
    };
  }

  // ── Discovery Flight: schedule ──
  @Post('students/:id/discovery')
  @Roles(...ADMIT_ROLES)
  async scheduleDF(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { scheduledAt?: string },
  ) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId)
      throw new ForbiddenException('Cross-unit access denied');
    const df = await this.prisma.discoveryFlight.create({
      data: {
        studentId: id,
        leadId: student.leadId,
        unitId: student.unitId,
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
  async recordDF(
    @Req() req: any,
    @Param('dfId') dfId: string,
    @Body() body: { resultCode: string; recommendation: string; notes?: string },
  ) {
    const df = await this.prisma.discoveryFlight.findUnique({ where: { id: dfId } });
    if (!df) throw new NotFoundException('Discovery Flight not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== df.unitId)
      throw new ForbiddenException('Cross-unit access denied');
    if (!['EP', 'GP', 'SP', 'NP', 'ND'].includes(body.resultCode))
      throw new BadRequestException('resultCode must be EP/GP/SP/NP/ND');
    if (!['READY', 'READY_WITH_SUPPORT', 'ALTERNATE_LEVEL'].includes(body.recommendation))
      throw new BadRequestException('Invalid recommendation');
    const updated = await this.prisma.discoveryFlight.update({
      where: { id: dfId },
      data: {
        conductedAt: new Date(),
        resultCode: body.resultCode as any,
        recommendation: body.recommendation,
        notes: body.notes || null,
      },
    });
    await this.audit.log(req, 'discovery_flights', dfId, 'UPDATE', df, {
      resultCode: body.resultCode,
      recommendation: body.recommendation,
    });
    return updated;
  }

  // ── Discovery Flight: Centre Head approval gate ──
  @Post('discovery/:dfId/approve')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async approveDF(@Req() req: any, @Param('dfId') dfId: string) {
    const df = await this.prisma.discoveryFlight.findUnique({ where: { id: dfId } });
    if (!df) throw new NotFoundException('Discovery Flight not found');
    if (req.user.role === 'CENTRE_HEAD' && req.user.unitId !== df.unitId)
      throw new ForbiddenException('Centre Heads approve their own unit only');
    if (!df.resultCode) throw new BadRequestException('Record the result before approval');
    const updated = await this.prisma.discoveryFlight.update({
      where: { id: dfId },
      data: { approvedById: req.user.sub, approvedAt: new Date() },
    });
    await this.audit.log(req, 'discovery_flights', dfId, 'UPDATE', null, { approved: true });
    return updated;
  }

  // ── Confirmation: admission number + batch + seat check + Enrolled ──
  @Post('students/:id/confirm')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'RECEPTIONIST')
  async confirm(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: { batchId: string; instalmentPlan?: string; orientationDate?: string },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { unit: true, discoveryFlights: { orderBy: { createdAt: 'desc' } } },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (student.status !== 'REGISTERED')
      throw new BadRequestException('Student is not awaiting confirmation');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId)
      throw new ForbiddenException('Cross-unit access denied');

    // Gate: latest Discovery Flight must be approved by CH
    const df = student.discoveryFlights[0];
    if (!df?.approvedAt)
      throw new BadRequestException(
        'Discovery Flight must be completed and approved by the Centre Head before confirmation',
      );

    const batch = await this.prisma.batch.findUnique({
      where: { id: body.batchId },
      include: { _count: { select: { students: true } } },
    });
    if (!batch || batch.unitId !== student.unitId)
      throw new BadRequestException("Pick a batch of the student's unit");
    if (!batch.isActive) throw new BadRequestException('Batch is inactive');
    if (batch._count.students >= batch.capacity)
      throw new BadRequestException(
        `Batch is full (${batch._count.students}/${batch.capacity}) — seat tracker blocked this admission`,
      );

    const admPrefix = `BB-${student.unit.code}-${AY_SHORT}-`;
    const admissionNo = `${admPrefix}${String(await this.nextSerial(admPrefix)).padStart(4, '0')}`;

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        admissionNo,
        status: 'ACTIVE',
        batchId: batch.id,
        admissionDate: new Date(),
        orientationDate: body.orientationDate
          ? new Date(`${body.orientationDate}T00:00:00Z`)
          : null,
        instalmentPlan: (body.instalmentPlan as any) || student.instalmentPlan || suggestPlan(),
      },
      include: { programme: true, batch: true, unit: { select: { code: true, name: true } } },
    });
    if (student.leadId) {
      await this.prisma.lead.update({ where: { id: student.leadId }, data: { stage: 'ENROLLED' } });
      await this.prisma.leadActivity.create({
        data: {
          leadId: student.leadId,
          type: 'SYSTEM',
          byId: req.user.sub,
          note: `Admission confirmed — ${admissionNo}`,
          meta: { batch: batch.name },
        },
      });
    }
    await this.audit.log(
      req,
      'students',
      id,
      'UPDATE',
      { status: 'REGISTERED', admissionNo: student.admissionNo },
      { status: 'ACTIVE', admissionNo, batchId: batch.id },
    );
    // Enrolment activates everything at once: attendance roster, fee ledger and
    // the parent portal account (the phone number is the login).
    const phone = student.fatherPhone || student.motherPhone;
    if (phone) {
      await this.prisma.messageLog
        .create({
          data: {
            type: 'ADMISSION_CONFIRMATION',
            recipient: phone,
            studentId: id,
            unitId: student.unitId,
            payload: {
              child: `${student.firstName} ${student.lastName}`,
              admissionNo,
              batch: batch.name,
              orientationDate: body.orientationDate ?? null,
              letterPdf: `/api/students/${id}/confirmation-letter/pdf`,
            },
          },
        })
        .catch(() => null);
      await sendWebPush(this.prisma, phone, {
        title: `Admission confirmed — ${student.firstName}`,
        body: `${admissionNo} · ${batch.name}. Tap to view the confirmation letter.`,
        url: '/parent',
        tag: `admission-${id}`,
      }).catch(() => null);
    }
    await this.audit.log(req, 'students', id, 'UPDATE', null, {
      letter: 'ADMISSION_CONFIRMATION',
      orientationDate: body.orientationDate ?? null,
    });
    return {
      ...updated,
      activated: { attendance: true, feeLedger: true, parentPortal: true },
      confirmationLetter: `/api/students/${id}/confirmation-letter`,
    };
  }

  // ── Admission confirmation letter (spec module 3) ──
  @Get('students/:id/confirmation-letter')
  @Roles(...ADMIT_ROLES)
  @Header('Content-Type', 'text/html')
  async confirmationLetterPrint(@Req() req: any, @Param('id') id: string) {
    return this.letterHtml(await this.confirmationLetter(id, req));
  }

  @Get('students/:id/confirmation-letter/pdf')
  @Roles(...ADMIT_ROLES)
  async confirmationLetterPdf(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const d = await this.confirmationLetter(id, req);
    const body =
      `This letter confirms the admission of ${d.child} (admission no. ${d.student.admissionNo}) to the ` +
      `${d.student.programme?.name ?? ''} programme in batch ${d.student.batch?.name ?? '-'} for academic year ${AY}. ` +
      `Annual fee INR ${num(d.schedule.net).toLocaleString('en-IN')} on ${d.planLabel.replace('Plan ', 'plan ')}. ` +
      `Orientation: ${d.student.orientationDate ? new Date(d.student.orientationDate).toLocaleDateString('en-IN') : 'to be announced'}.`;
    const file = await this.pdf.certificatePdf({
      serialNo: d.student.admissionNo,
      title: 'Admission Confirmation',
      body,
      childName: d.child,
      admissionNo: d.student.admissionNo,
      programme: d.student.programme?.name ?? null,
      unitName: d.student.unit.name,
      issuedAt: d.student.admissionDate ?? new Date(),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${d.student.admissionNo}-confirmation.pdf"`,
    );
    return res.send(file);
  }
}

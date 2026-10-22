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
import { AuthGuard } from '../../common/auth/auth.guard';
import { PdfService } from '../../common/pdf/pdf.service';
import type { Response } from 'express';
import { Roles } from '../../common/auth/roles.decorator';
import { unitScope } from '../../common/auth/unit-scope';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { sendWebPush } from '../../modules/notifications/push.service';
import { CancelReceiptDto, CreatePaymentDto } from './dto/payment.dto';
import {
  ACADEMIC_YEAR,
  ACADEMIC_YEAR_SHORT,
  buildLedger,
  buildSchedule,
  daysFromDue,
  nextSerial,
  num,
  receiptNo as formatReceiptNo,
  reminderStage,
} from './fees.rules';

const AY = ACADEMIC_YEAR;
const AY_SHORT = ACADEMIC_YEAR_SHORT;
const COLLECT_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

@Controller('fees')
@UseGuards(AuthGuard)
export class FeesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private pdf: PdfService,
  ) {}

  // Shared ledger math lives in ./fees.rules (pure + unit tested).
  private buildSchedule(structure: any, plan: string, hasSibling: boolean) {
    return buildSchedule(structure, plan, hasSibling);
  }

  private async studentLedger(s: any, structure: any, txns: any[]) {
    const plan = s.instalmentPlan ?? 'PLAN_C';
    return buildLedger(
      buildSchedule(structure, plan, !!s.siblingGroup),
      plan,
      txns,
      new Date().toISOString().slice(0, 10),
    );
  }

  @Get('structures')
  structures(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.feeStructure.findMany({
      where: { academicYear: AY, ...unitScope(req.user, unitId) },
      include: {
        unit: { select: { code: true, name: true } },
        programme: { select: { name: true, tierName: true, levelColour: true } },
      },
      orderBy: [{ unitId: 'asc' }, { programmeId: 'asc' }],
    });
  }

  @Post('structures')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async upsertStructure(@Req() req: any, @Body() b: any) {
    if (!b.unitId || !b.programmeId || !b.totalFee)
      throw new BadRequestException('unitId, programmeId and totalFee are required');
    const existing = await this.prisma.feeStructure.findUnique({
      where: {
        unitId_programmeId_academicYear: {
          unitId: b.unitId,
          programmeId: b.programmeId,
          academicYear: AY,
        },
      },
    });
    if (existing?.locked && !b.unlock)
      throw new BadRequestException(
        'Structure is locked for this AY. Founder must unlock to edit.',
      );
    const data = {
      totalFee: b.totalFee,
      instalment1: b.instalment1 ?? null,
      instalment2: b.instalment2 ?? null,
      instalment3: b.instalment3 ?? null,
      siblingDiscountPct: b.siblingDiscountPct ?? null,
      locked: b.locked ?? existing?.locked ?? false,
    };
    const row = existing
      ? await this.prisma.feeStructure.update({ where: { id: existing.id }, data })
      : await this.prisma.feeStructure.create({
          data: { unitId: b.unitId, programmeId: b.programmeId, academicYear: AY, ...data },
        });
    await this.audit.log(
      req,
      'fee_structures',
      row.id,
      existing ? 'UPDATE' : 'INSERT',
      existing,
      row,
    );
    return row;
  }

  // ───────────────────── ledger (per unit) ─────────────────────
  @Get('ledger')
  async ledger(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE', ...scope },
      include: {
        programme: { select: { id: true, name: true, levelColour: true } },
        unit: { select: { code: true } },
        feeTransactions: true,
      },
      orderBy: { admissionNo: 'asc' },
    });
    const structures = await this.prisma.feeStructure.findMany({ where: { academicYear: AY } });
    const sMap = new Map(structures.map((f) => [`${f.unitId}:${f.programmeId}`, f]));
    const rows: any[] = [];
    for (const s of students) {
      const structure = sMap.get(`${s.unitId}:${s.programmeId}`);
      const led = await this.studentLedger(s, structure, s.feeTransactions);
      rows.push({
        id: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`,
        unit: s.unit.code,
        programme: s.programme,
        sibling: !!s.siblingGroup,
        ...led,
        status:
          led.balance <= 0
            ? 'PAID'
            : led.overdue > 0
              ? 'OVERDUE'
              : led.paid > 0
                ? 'PARTIAL'
                : 'DUE',
      });
    }
    return rows;
  }

  // Single-student ledger incl. receipts (for the drawer)
  @Get('ledger/:studentId')
  async studentLedgerFull(@Req() req: any, @Param('studentId') id: string) {
    const s = await this.prisma.student.findUnique({
      where: { id },
      include: {
        programme: true,
        unit: { select: { id: true, code: true, name: true } },
        feeTransactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId)
      throw new ForbiddenException('Cross-unit access denied');
    // A student without a programme has no fee structure — the schedule
    // helpers treat `null` as an empty structure.
    const structure = s.programmeId
      ? await this.prisma.feeStructure.findUnique({
          where: {
            unitId_programmeId_academicYear: {
              unitId: s.unitId,
              programmeId: s.programmeId,
              academicYear: AY,
            },
          },
        })
      : null;
    const led = await this.studentLedger(s, structure, s.feeTransactions);
    return {
      student: {
        id: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`,
        unit: s.unit,
        programme: s.programme?.name ?? null,
        sibling: !!s.siblingGroup,
      },
      ledger: led,
      receipts: s.feeTransactions.map((t) => ({
        id: t.id,
        receiptNo: t.receiptNo,
        amount: num(t.amount),
        mode: t.paymentMode,
        date: t.paymentDate,
        instalmentNo: t.instalmentNo,
        ledgerType: t.ledgerType,
        isCancelled: t.isCancelled,
        reference: t.reference,
      })),
    };
  }

  // ───────────────────── record payment → receipt ─────────────────────
  @Post('pay')
  @Roles(...COLLECT_ROLES)
  async pay(@Req() req: any, @Body() b: CreatePaymentDto) {
    if (!b.studentId || !b.amount || b.amount <= 0 || !b.paymentMode)
      throw new BadRequestException('studentId, amount and paymentMode are required');
    const s = await this.prisma.student.findUnique({
      where: { id: b.studentId },
      include: { unit: { select: { id: true, code: true } } },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId)
      throw new ForbiddenException('Cross-unit access denied');

    // Receipt serial: BB-U?-RCPT-2627-NNNN (per unit, sequential, never reused)
    const prefix = `BB-${s.unit.code}-RCPT-${AY_SHORT}-`;
    const last = await this.prisma.feeTransaction.findFirst({
      where: { receiptNo: { startsWith: prefix } },
      orderBy: { receiptNo: 'desc' },
    });
    const receiptNo = formatReceiptNo(s.unit.code, nextSerial(prefix, last?.receiptNo));

    const txn = await this.prisma.feeTransaction.create({
      data: {
        studentId: s.id,
        unitId: s.unitId,
        ledgerType: (b.ledgerType as any) ?? 'PRESCHOOL', // dual ledger — never merged
        amount: b.amount,
        discount: b.discount ?? 0,
        fine: b.fine ?? 0,
        paymentMode: b.paymentMode as any,
        reference: b.reference ?? null,
        paymentDate: new Date(b.paymentDate ?? new Date().toISOString().slice(0, 10)),
        instalmentNo: b.instalmentNo ?? null,
        receiptNo,
        remarks: b.remarks ?? null,
        collectedById: req.user.sub,
      },
    });
    await this.audit.log(req, 'fee_transactions', txn.id, 'INSERT', null, txn);
    // Receipt → parent WhatsApp (BSP live in Slice 7; queued now)
    const phone = s.fatherPhone || s.motherPhone;
    if (phone) {
      await this.prisma.messageLog.create({
        data: {
          type: 'RECEIPT',
          recipient: phone,
          studentId: s.id,
          unitId: s.unitId,
          payload: { receiptNo, amount: b.amount, child: `${s.firstName} ${s.lastName}` },
        },
      });
    }
    return txn;
  }

  // Cancel a receipt (audited; amount excluded from ledger)
  @Post('receipt/:id/cancel')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async cancel(@Req() req: any, @Param('id') id: string, @Body() b: CancelReceiptDto) {
    if (!b.reason?.trim())
      throw new BadRequestException('Cancellation reason is required (audited)');
    const txn = await this.prisma.feeTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Receipt not found');
    const upd = await this.prisma.feeTransaction.update({
      where: { id },
      data: { isCancelled: true, remarks: `${txn.remarks ?? ''} [CANCELLED: ${b.reason}]`.trim() },
    });
    await this.audit.log(req, 'fee_transactions', id, 'UPDATE', txn, upd);
    return upd;
  }

  // ───────────────────── printable receipt ─────────────────────
  /**
   * The receipt as a real PDF (parent document vault, WhatsApp/email attachment,
   * offline archive). The HTML endpoint below stays for browser printing.
   */
  @Get('receipt/:id/pdf')
  async receiptPdf(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    const t = await this.prisma.feeTransaction.findUnique({
      where: { id },
      include: { student: { include: { programme: true, batch: true } }, unit: true },
    });
    if (!t) throw new NotFoundException('Receipt not found');
    if (req.user.role === 'PARENT') {
      if (!req.user.studentIds?.includes(t.studentId))
        throw new ForbiddenException('Not your child');
    } else if (
      !HO_ROLES.includes(req.user.role) &&
      !['CENTRE_HEAD', 'COORDINATOR', 'TEACHER'].includes(req.user.role)
    ) {
      throw new ForbiddenException();
    }
    if (t.isCancelled) throw new BadRequestException('This receipt was cancelled');

    const collector = t.collectedById
      ? await this.prisma.user.findUnique({
          where: { id: t.collectedById },
          select: { fullName: true },
        })
      : null;

    const pdf = await this.pdf.receiptPdf({
      receiptNo: t.receiptNo,
      paymentDate: t.paymentDate,
      studentName: `${t.student.firstName} ${t.student.lastName}`,
      admissionNo: t.student.admissionNo,
      programme: t.student.programme?.name ?? null,
      batch: t.student.batch?.name ?? null,
      unitName: t.unit.name,
      unitCode: t.unit.code,
      amount: Number(t.amount),
      discount: Number(t.discount ?? 0) || undefined,
      fine: Number(t.fine ?? 0) || undefined,
      paymentMode: String(t.paymentMode),
      reference: t.reference ?? null,
      ledgerType: String(t.ledgerType),
      collectedBy: collector?.fullName ?? null,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${t.receiptNo}.pdf"`);
    return res.send(pdf);
  }

  @Get('receipt/:id/print')
  @Header('Content-Type', 'text/html')
  async printReceipt(@Req() req: any, @Param('id') id: string) {
    const t = await this.prisma.feeTransaction.findUnique({
      where: { id },
      include: { student: { include: { programme: true } }, unit: true },
    });
    if (!t) throw new NotFoundException('Receipt not found');
    // Parents may print receipts for their own children only
    if (req.user.role === 'PARENT') {
      if (!req.user.studentIds?.includes(t.studentId))
        throw new ForbiddenException('Not your child');
    } else if (
      !HO_ROLES.includes(req.user.role) &&
      !['CENTRE_HEAD', 'COORDINATOR', 'TEACHER'].includes(req.user.role)
    )
      throw new ForbiddenException();
    const collector = t.collectedById
      ? await this.prisma.user.findUnique({
          where: { id: t.collectedById },
          select: { fullName: true },
        })
      : null;
    const s = t.student;
    const row = (l: string, v: string) => `<tr><td class="l">${l}</td><td class="v">${v}</td></tr>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${t.receiptNo}</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;background:#fff;color:#1F1B13;padding:40px;display:flex;justify-content:center}
      .sheet{width:640px;border:1px solid #E5D9B5;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(31,27,19,.08)}
      .head{background:linear-gradient(145deg,#F8EDCD,#EBDBAC);padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
      .brand{font-size:22px;font-weight:800;color:#8A6410}.brand small{display:block;font-size:11px;font-weight:600;color:#6b5a2e;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
      .rno{text-align:right}.rno b{display:block;font-size:15px;color:#1F1B13}.rno span{font-size:11px;color:#6b5a2e;font-weight:700;letter-spacing:.1em}
      ${t.isCancelled ? '.sheet{position:relative}.cancel{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-18deg);font-size:64px;font-weight:900;color:rgba(200,40,40,.25);border:6px solid rgba(200,40,40,.25);padding:8px 28px;border-radius:12px;letter-spacing:.1em}' : ''}
      table{width:100%;border-collapse:collapse;padding:0}
      td{padding:11px 32px;font-size:14px;border-bottom:1px solid #F3EAD0}
      td.l{color:#57534e;font-weight:600;width:42%}td.v{font-weight:700}
      .amt{background:linear-gradient(145deg,#DCA93C,#A97716);color:#fff;padding:20px 32px;display:flex;justify-content:space-between;align-items:center}
      .amt span{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.9}.amt b{font-size:26px}
      .foot{padding:18px 32px;font-size:11px;color:#78716c;display:flex;justify-content:space-between}
      @media print{body{padding:0}.sheet{border:none;box-shadow:none}}
    </style></head><body><div class="sheet">
      ${t.isCancelled ? '<div class="cancel">CANCELLED</div>' : ''}
      <div class="head"><div class="brand">🐝 BumbleB Kidz<small>${t.unit.name} · Fee Receipt</small></div>
      <div class="rno"><span>RECEIPT NO</span><b>${t.receiptNo}</b></div></div>
      <table>
      ${row('Student', `${s.firstName} ${s.lastName} (${s.admissionNo})`)}
      ${row('Programme', s.programme?.name ?? '—')}
      ${row('Academic Year', AY)}
      ${row('Ledger', t.ledgerType === 'EVENING' ? 'Evening Centre (monthly)' : 'Preschool (annual)')}
      ${row('Instalment', t.instalmentNo ? `Instalment ${t.instalmentNo}` : '—')}
      ${row('Payment Mode', `${t.paymentMode}${t.reference ? ' · ' + t.reference : ''}`)}
      ${row('Payment Date', new Date(t.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}
      ${num(t.discount) ? row('Discount', inr(num(t.discount))) : ''}
      ${num(t.fine) ? row('Late Fine', inr(num(t.fine))) : ''}
      ${t.remarks ? row('Remarks', t.remarks) : ''}
      </table>
      <div class="amt"><span>Amount Received</span><b>${inr(num(t.amount))}</b></div>
      <div class="foot"><span>Collected by: ${collector?.fullName ?? '—'}</span><span>Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · BumbleB Kidz ERP</span></div>
    </div><script>window.print && setTimeout(()=>window.print(), 400)</script></body></html>`;
  }

  // ───────────────────── collection summary ─────────────────────
  @Get('summary')
  async summary(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const txns = await this.prisma.feeTransaction.findMany({
      where: { isCancelled: false, ...scope },
    });
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const byMode: Record<string, number> = {};
    let total = 0,
      month = 0;
    for (const t of txns) {
      const a = num(t.amount);
      total += a;
      if (new Date(t.paymentDate) >= monthStart) month += a;
      byMode[t.paymentMode] = (byMode[t.paymentMode] ?? 0) + a;
    }
    const ledger = await this.ledger(req, unitId);
    const outstanding = ledger.reduce((a: number, r: any) => a + Math.max(0, r.balance), 0);
    const overdue = ledger.reduce((a: number, r: any) => a + r.overdue, 0);
    return {
      collectedTotal: total,
      collectedThisMonth: month,
      receipts: txns.length,
      outstanding,
      overdue,
      byMode,
    };
  }

  // ───────────────────── fee reminders (T-5 / T0 / T+3 / T+7) ─────────────────────
  @Post('reminders/run')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async runReminders(@Req() req: any, @Query('unitId') unitId?: string) {
    const rows: any[] = await this.ledger(req, unitId);
    const todayISO = new Date().toISOString().slice(0, 10);
    let queued = 0;
    for (const r of rows) {
      for (const inst of r.instalments) {
        if (inst.paid >= inst.amount) continue;
        const stage = reminderStage(daysFromDue(inst.dueDate, todayISO));
        if (!stage) continue;
        const dup = await this.prisma.messageLog.findFirst({
          where: {
            type: 'FEE_REMINDER',
            studentId: r.id,
            payload: { path: ['stage'], equals: stage },
          },
        });
        if (dup && (dup.payload as any)?.instalmentNo === inst.no) continue;
        const student = await this.prisma.student.findUnique({
          where: { id: r.id },
          select: { fatherPhone: true, motherPhone: true, unitId: true },
        });
        const phone = student?.fatherPhone || student?.motherPhone;
        if (!phone) continue;
        await this.prisma.messageLog.create({
          data: {
            type: 'FEE_REMINDER',
            recipient: phone,
            studentId: r.id,
            unitId: student!.unitId,
            payload: {
              stage,
              instalmentNo: inst.no,
              amountDue: inst.amount - inst.paid,
              dueDate: inst.dueDate,
              child: r.name,
            },
          },
        });
        await sendWebPush(this.prisma, phone, {
          title: 'Fee reminder',
          body: `₹${inst.amount - inst.paid} is due for ${r.name}.`,
          url: '/parent',
          tag: `fee-${r.id}-${inst.no}-${stage}`,
        });
        queued++;
      }
    }
    await this.audit.log(req, 'message_logs', 'fee-reminders', 'INSERT', null, { queued });
    return { ok: true, queued };
  }

  @Get('reminders')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  reminders(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role)
      ? unitId
        ? { unitId }
        : {}
      : { unitId: req.user.unitId };
    return this.prisma.messageLog.findMany({
      where: { ...scope, type: { in: ['FEE_REMINDER', 'RECEIPT'] } },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}

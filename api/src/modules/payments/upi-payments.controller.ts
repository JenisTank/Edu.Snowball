import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { env } from '../../config/env';
import { OnlineSettlementService } from './online-settlement.service';
import {
  buildUpiLink,
  claimDecision,
  isValidPayerRef,
  isValidVpa,
  payableAmount,
  paymentStatusLabel,
  UPI_MAX_RUPEES,
} from './upi.rules';
import { qrDataUrl, qrSvg } from './qr';
import { ClaimUpiPaymentDto, ConfirmUpiPaymentDto, CreateUpiIntentDto } from './payments.dto';

const ACADEMIC_YEAR = '2026-27';

const DESK_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];
const ALL_ROLES = ['PARENT', ...DESK_ROLES];

/**
 * UPI fee collection.
 *
 * No payment gateway: the centre's VPA is published in Settings, the QR is
 * generated per amount, and the money arrives directly in the centre's bank
 * account. Three states matter to the desk — `CREATED` (QR shown, nothing
 * claimed), `CLAIMED` (parent says they paid, UTR captured) and `PAID` (desk
 * matched the bank statement, receipt issued). Only `confirm` writes a
 * FeeTransaction, so a claim can never be mistaken for revenue.
 */
@Controller('fees/upi')
@UseGuards(AuthGuard)
export class UpiPaymentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settlement: OnlineSettlementService,
  ) {}

  /** Where the money should go for a unit: unit VPA, else the HO default. */
  private async vpaFor(unitId: string) {
    const unit = await this.prisma.unitSettings.findUnique({ where: { unitId } });
    const fallback = await this.prisma.appSetting.findUnique({ where: { key: 'payments.upi' } });
    const ho = (fallback?.value as any) ?? {};
    // Unit VPA wins; then an HO row set in Settings; then the env fallback.
    const vpa = unit?.upiVpa || ho.vpa || env.upiVpa || '';
    const payeeName = unit?.upiPayeeName || ho.payeeName || env.upiPayeeName;
    const source = unit?.upiVpa ? 'UNIT' : ho.vpa ? 'HO' : env.upiVpa ? 'ENV' : 'NONE';
    return { vpa, payeeName, source };
  }

  @Get('config')
  async config(@Req() req: any, @Query('unitId') unitId?: string) {
    const unit = HO_ROLES.includes(req.user.role) ? (unitId ?? req.user.unitId) : req.user.unitId;
    const target = await this.vpaFor(unit ?? '');
    return {
      enabled: isValidVpa(target.vpa),
      provider: 'UPI',
      mode: 'QR',
      vpa: target.vpa,
      payeeName: target.payeeName,
      source: target.source,
      cap: UPI_MAX_RUPEES,
      note: isValidVpa(target.vpa)
        ? 'Scan with any UPI app. The front desk confirms the credit and issues the receipt.'
        : 'No UPI id configured yet — Head Office sets it in Settings.',
    };
  }

  private assertOwnership(user: any, studentId: string) {
    if (user.role === 'PARENT' && !user.studentIds?.includes(studentId))
      throw new ForbiddenException('Not your child');
  }

  /**
   * Create (or reuse) a QR for an amount.
   *
   * An outstanding intent for the same student and amount is reused rather
   * than stacked: a parent refreshing the screen must not leave ten open QRs
   * for the desk to reconcile.
   */
  @Post('intent')
  @Roles(...ALL_ROLES)
  async createIntent(@Req() req: any, @Body() b: CreateUpiIntentDto) {
    this.assertOwnership(req.user, b.studentId);
    const student = await this.prisma.student.findUnique({ where: { id: b.studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (
      !HO_ROLES.includes(req.user.role) &&
      req.user.role !== 'PARENT' &&
      req.user.unitId !== student.unitId
    )
      throw new ForbiddenException('Cross-unit access denied');

    const target = await this.vpaFor(student.unitId);
    if (!isValidVpa(target.vpa))
      throw new BadRequestException('Online UPI is not configured for this unit yet');

    const outstanding = await this.outstandingFor(student);
    let amount: number;
    try {
      amount = payableAmount(b.amount, outstanding);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    const open = await this.prisma.onlinePayment.findFirst({
      where: {
        studentId: student.id,
        status: 'CREATED',
        amount,
        createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (open?.upiLink) {
      return this.present(open, student, await qrDataUrl(open.upiLink));
    }

    const reference = `BB${Date.now().toString(36).toUpperCase()}${student.admissionNo.slice(-4)}`;
    let link: string;
    try {
      link = buildUpiLink({
        vpa: target.vpa,
        payeeName: target.payeeName,
        amount,
        reference,
        note: `${student.admissionNo} fees`,
      });
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    const intent = await this.prisma.onlinePayment.create({
      data: {
        studentId: student.id,
        unitId: student.unitId,
        amount,
        ledgerType: (b.ledgerType as any) ?? 'PRESCHOOL',
        provider: 'UPI',
        mode: 'QR',
        orderId: reference,
        upiLink: link,
        status: 'CREATED',
      },
    });
    await this.audit.log(req, 'online_payments', intent.id, 'INSERT', null, {
      orderId: reference,
      amount,
      provider: 'UPI',
    });
    return this.present(intent, student, await qrDataUrl(link));
  }

  /**
   * Outstanding preschool balance for a child.
   *
   * Same arithmetic the parent portal shows (structure for the programme and
   * academic year, sibling concession, then cancelled receipts excluded), so
   * the QR can never ask for a different number than the screen displays.
   */
  private async outstandingFor(student: {
    id: string;
    unitId: string;
    programmeId: string | null;
    siblingGroup: string | null;
  }) {
    const [structure, transactions, addons] = await Promise.all([
      student.programmeId
        ? this.prisma.feeStructure.findUnique({
            where: {
              unitId_programmeId_academicYear: {
                unitId: student.unitId,
                programmeId: student.programmeId,
                academicYear: ACADEMIC_YEAR,
              },
            },
          })
        : null,
      this.prisma.feeTransaction.findMany({
        where: { studentId: student.id, ledgerType: 'PRESCHOOL', isCancelled: false },
        select: { amount: true },
      }),
      this.prisma.feeAddon.findMany({ where: { studentId: student.id }, select: { amount: true } }),
    ]);
    const gross = Number(structure?.totalFee ?? 0);
    const pct = student.siblingGroup ? Number(structure?.siblingDiscountPct ?? 0) : 0;
    const net =
      gross -
      Math.round((gross * pct) / 100) +
      addons.reduce((n, a) => n + Number(a.amount ?? 0), 0);
    const paid = transactions.reduce((n, t) => n + Number(t.amount ?? 0), 0);
    const balance = Math.round((net - paid) * 100) / 100;
    return balance > 0 ? balance : 0;
  }

  private async present(intent: any, student: any, qr: string) {
    return {
      intentId: intent.id,
      reference: intent.orderId,
      amount: Number(intent.amount),
      currency: 'INR',
      status: intent.status,
      label: paymentStatusLabel(intent.status),
      upiLink: intent.upiLink,
      qr,
      studentName: `${student.firstName} ${student.lastName}`,
      note: `Reference ${intent.orderId} — quote it if the desk asks.`,
    };
  }

  /** Printable QR for the counter: `GET /fees/upi/:id/qr.svg`. */
  @Get(':id/qr.svg')
  async svg(@Req() req: any, @Param('id') id: string) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent?.upiLink) throw new NotFoundException();
    this.assertOwnership(req.user, intent.studentId);
    return { svg: await qrSvg(intent.upiLink) };
  }

  @Get(':id')
  async status(@Req() req: any, @Param('id') id: string) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    this.assertOwnership(req.user, intent.studentId);
    if (
      req.user.role !== 'PARENT' &&
      !HO_ROLES.includes(req.user.role) &&
      req.user.unitId !== intent.unitId
    )
      throw new ForbiddenException();
    return { ...intent, label: paymentStatusLabel(intent.status) };
  }

  /**
   * The parent reports the UPI reference. This is a claim, not a payment: the
   * desk still has to match it against the bank statement.
   */
  @Post(':id/claim')
  @Roles(...ALL_ROLES)
  async claim(@Req() req: any, @Param('id') id: string, @Body() b: ClaimUpiPaymentDto) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    this.assertOwnership(req.user, intent.studentId);

    const decision = claimDecision(intent, b.payerRef);
    if (decision === 'REJECT')
      throw new BadRequestException(
        isValidPayerRef(b.payerRef)
          ? 'This payment link has expired — generate a new QR'
          : 'Enter the UPI reference from your payment app (8–24 letters or digits)',
      );
    if (decision === 'REPLAY')
      return { ok: true, status: intent.status, label: paymentStatusLabel(intent.status) };

    const updated = await this.prisma.onlinePayment.update({
      where: { id },
      data: { status: 'CLAIMED', payerRef: b.payerRef.trim(), claimedAt: new Date() },
    });
    await this.audit.log(req, 'online_payments', id, 'UPDATE', intent, {
      status: 'CLAIMED',
      payerRef: updated.payerRef,
    });
    return {
      ok: true,
      status: 'CLAIMED',
      label: paymentStatusLabel('CLAIMED'),
      message: 'Thanks — the centre will confirm the credit and issue your receipt.',
    };
  }

  /**
   * The QR this parent already has open, if any — so reopening the app shows
   * the same intent instead of minting a new one.
   */
  @Get('open/:studentId')
  @Roles(...ALL_ROLES)
  async openFor(@Req() req: any, @Param('studentId') studentId: string) {
    this.assertOwnership(req.user, studentId);
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    const intent = await this.prisma.onlinePayment.findFirst({
      where: {
        studentId,
        provider: 'UPI',
        status: { in: ['CREATED', 'CLAIMED'] },
        createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!intent?.upiLink) return null;
    return this.present(intent, student, await qrDataUrl(intent.upiLink));
  }

  /** Desk queue: claims waiting to be matched against the bank statement. */
  @Get('pending/list')
  @Roles(...DESK_ROLES)
  async pending(@Req() req: any, @Query('unitId') unitId?: string) {
    const unit = HO_ROLES.includes(req.user.role) ? unitId : req.user.unitId;
    const rows = await this.prisma.onlinePayment.findMany({
      where: {
        provider: 'UPI',
        status: { in: ['CLAIMED', 'CREATED'] },
        ...(unit ? { unitId: unit } : {}),
      },
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true } },
      },
      orderBy: [{ claimedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((r: any) => ({
      id: r.id,
      reference: r.orderId,
      amount: Number(r.amount),
      status: r.status,
      label: paymentStatusLabel(r.status),
      payerRef: r.payerRef,
      claimedAt: r.claimedAt,
      createdAt: r.createdAt,
      student: {
        admissionNo: r.student.admissionNo,
        name: `${r.student.firstName} ${r.student.lastName}`,
      },
    }));
  }

  /** Desk confirms the credit: this is where a receipt is born. */
  @Post(':id/confirm')
  @Roles(...DESK_ROLES)
  async confirm(@Req() req: any, @Param('id') id: string, @Body() b: ConfirmUpiPaymentDto) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    if (intent.status === 'PAID')
      return { ok: true, status: 'PAID', receiptNo: null, note: 'Already confirmed' };
    if (!['CREATED', 'CLAIMED'].includes(intent.status))
      throw new BadRequestException(`A ${intent.status.toLowerCase()} payment cannot be confirmed`);
    if (!intent.payerRef && b.payerRef) {
      await this.prisma.onlinePayment.update({
        where: { id },
        data: { payerRef: b.payerRef.trim(), claimedAt: intent.claimedAt ?? new Date() },
      });
      intent.payerRef = b.payerRef.trim();
    }

    const result = await this.settlement.settle(
      { ...intent, payerRef: intent.payerRef },
      intent.payerRef ?? intent.orderId,
    );
    await this.audit.log(
      req,
      'online_payments',
      intent.id,
      'UPDATE',
      { status: intent.status },
      { status: 'PAID', receiptNo: result.transaction.receiptNo },
    );
    return {
      ok: true,
      status: 'PAID',
      receiptNo: result.transaction.receiptNo,
      amount: Number(intent.amount),
    };
  }

  /** Desk rejects a claim (money never arrived, or it belongs to another child). */
  @Post(':id/reject')
  @Roles(...DESK_ROLES)
  async reject(@Req() req: any, @Param('id') id: string, @Body() b: ConfirmUpiPaymentDto) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    if (intent.status === 'PAID') throw new BadRequestException('A paid intent cannot be rejected');
    const updated = await this.prisma.onlinePayment.update({
      where: { id },
      data: {
        status: 'FAILED',
        failureReason: b.payerRef?.trim() || 'Not found in the bank statement',
      },
    });
    await this.audit.log(req, 'online_payments', id, 'UPDATE', intent, {
      status: 'FAILED',
      reason: updated.failureReason,
    });
    return { ok: true, status: 'FAILED' };
  }
}

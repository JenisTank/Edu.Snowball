import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
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
import { paiseFromRupees, paymentStatusLabel } from './payments.rules';
import { createRazorpayAdapter } from './razorpay.adapter';
import { CreateOnlineOrderDto, VerifyOnlinePaymentDto } from './payments.dto';

const STAFF_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];

/**
 * Online fee collection.
 *
 * `config` tells the parent portal whether the merchant account is live yet;
 * `order` creates a Razorpay order (or a deterministic sandbox order when there
 * are no keys); `verify` completes the browser flow; `simulate` drives the
 * sandbox end-to-end for demos and tests without touching the ledger.
 */
@Controller('fees/online')
@UseGuards(AuthGuard)
export class OnlinePaymentsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settlement: OnlineSettlementService,
  ) {}

  private get gateway() {
    return createRazorpayAdapter();
  }

  @Get('config')
  config() {
    return {
      enabled: this.gateway.mode === 'LIVE',
      mode: this.gateway.mode,
      keyId: this.gateway.keyId,
      provider: 'RAZORPAY',
      note:
        this.gateway.mode === 'LIVE'
          ? 'Online payment is live.'
          : 'Sandbox: merchant KYC is pending, so no money can move yet.',
    };
  }

  private assertOwnership(user: any, studentId: string) {
    if (user.role === 'PARENT' && !user.studentIds?.includes(studentId))
      throw new ForbiddenException('Not your child');
  }

  @Post('order')
  @Roles('PARENT', ...STAFF_ROLES)
  async createOrder(@Req() req: any, @Body() b: CreateOnlineOrderDto) {
    this.assertOwnership(req.user, b.studentId);
    const student = await this.prisma.student.findUnique({ where: { id: b.studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (
      !HO_ROLES.includes(req.user.role) &&
      req.user.role !== 'PARENT' &&
      req.user.unitId !== student.unitId
    )
      throw new ForbiddenException('Cross-unit access denied');

    let paise: number;
    try {
      paise = paiseFromRupees(b.amount, env.onlinePaymentCap);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    const intent = await this.prisma.onlinePayment.create({
      data: {
        studentId: student.id,
        unitId: student.unitId,
        amount: b.amount,
        ledgerType: (b.ledgerType as any) ?? 'PRESCHOOL',
        mode: this.gateway.mode,
        orderId: `pending_${Date.now()}_${student.id.slice(0, 8)}`,
        status: 'CREATED',
      },
    });

    let order;
    try {
      order = await this.gateway.createOrder({
        amountPaise: paise,
        receipt: intent.id,
        notes: { studentId: student.id, admissionNo: student.admissionNo },
      });
    } catch (e: any) {
      await this.prisma.onlinePayment.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureReason: e.message ?? 'Gateway error' },
      });
      throw new BadRequestException(e.message ?? 'Could not start the payment');
    }

    const saved = await this.prisma.onlinePayment.update({
      where: { id: intent.id },
      data: { orderId: order.id },
    });
    await this.audit.log(req, 'online_payments', saved.id, 'INSERT', null, saved);
    return {
      intentId: saved.id,
      orderId: order.id,
      amount: paise,
      currency: order.currency ?? 'INR',
      mode: this.gateway.mode,
      keyId: this.gateway.keyId,
      studentName: `${student.firstName} ${student.lastName}`,
      prefillPhone: student.fatherPhone || student.motherPhone || '',
    };
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

  /** Browser checkout callback: verifies the signature, then books the receipt. */
  @Post(':id/verify')
  @Roles('PARENT', ...STAFF_ROLES)
  async verify(@Req() req: any, @Param('id') id: string, @Body() b: VerifyOnlinePaymentDto) {
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    this.assertOwnership(req.user, intent.studentId);
    if (intent.status === 'PAID') return { ok: true, status: 'PAID', intentId: intent.id };
    if (intent.mode !== 'LIVE') throw new BadRequestException('Sandbox payment cannot be verified');
    if (!this.gateway.verifyCheckout(intent.orderId, b.razorpayPaymentId, b.razorpaySignature))
      throw new BadRequestException('Payment signature did not match');

    const result = await this.settlement.settle(intent, b.razorpayPaymentId);
    await this.audit.log(
      req,
      'online_payments',
      intent.id,
      'UPDATE',
      { status: intent.status },
      { status: 'PAID', receiptNo: result.transaction.receiptNo },
    );
    return { ok: true, status: 'PAID', receiptNo: result.transaction.receiptNo };
  }

  /**
   * Sandbox only: marks the order paid so the screen can be demonstrated.
   * Deliberately writes no FeeTransaction — a demo must never look like revenue.
   */
  @Post(':id/simulate')
  @Roles(...STAFF_ROLES)
  async simulate(@Req() req: any, @Param('id') id: string) {
    if (this.gateway.mode === 'LIVE')
      throw new BadRequestException('Simulation is disabled while the gateway is live');
    const intent = await this.prisma.onlinePayment.findUnique({ where: { id } });
    if (!intent) throw new NotFoundException();
    const updated = await this.prisma.onlinePayment.update({
      where: { id },
      data: {
        status: 'PAID',
        providerPaymentId: `pay_mock_${intent.id.slice(0, 8)}`,
        paidAt: new Date(),
      },
    });
    await this.audit.log(req, 'online_payments', id, 'UPDATE', intent, updated);
    return { ...updated, sandbox: true, note: 'Sandbox payment — no receipt was issued.' };
  }
}

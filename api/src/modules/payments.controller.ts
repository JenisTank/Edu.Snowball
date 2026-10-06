import {
  Body, Controller, Get, Module, Param, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthGuard, Roles, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';
import { issueReceipt } from './receipts';
import { notifyParent } from './notify';

// ─────────────────────────────────────────────────────────────
// Payments (Slice 7) — Razorpay + UPI
//
// PLACEHOLDER MODE (default): no merchant keys in .env, so no money moves.
// Orders are still created, shown to the parent, and can be settled by the
// centre once the parent pays at the counter / by UPI. Everything downstream
// (receipt number, ledger, parent notification) is already wired.
//
// LIVE MODE: set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET (+ RAZORPAY_WEBHOOK_SECRET)
// and the same endpoints create real Razorpay orders, verify the checkout
// signature, and settle automatically from the webhook. No code change needed.
//
// UPI: set UPI_VPA (+ UPI_PAYEE_NAME) to render a real intent/QR string. The
// parent pays into the school VPA and the centre confirms the reference —
// useful on day one, before the gateway KYC completes.
// ─────────────────────────────────────────────────────────────

const AY = '2026-27';
const SETTLE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];
const num = (v: any) => (v == null ? 0 : Number(v));
const DUE: Record<string, string[]> = {
  PLAN_A: ['2026-04-10', '2026-07-10', '2026-10-10'],
  PLAN_B: ['2026-04-10', '2026-10-10'],
  PLAN_C: ['2026-04-10'],
};

export function razorpayLive() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

@Controller('payments')
export class PaymentsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ── What the client should render (parent portal + staff screen) ──
  @Get('config')
  config() {
    const live = razorpayLive();
    return {
      live,
      placeholder: !live,
      provider: 'RAZORPAY',
      keyId: live ? process.env.RAZORPAY_KEY_ID : null,
      currency: 'INR',
      upiEnabled: !!process.env.UPI_VPA,
      upiVpa: process.env.UPI_VPA ?? null,
      payeeName: process.env.UPI_PAYEE_NAME ?? 'BumbleB Kidz',
      note: live
        ? 'Online payments are live.'
        : 'Online payments are in placeholder mode — Razorpay merchant KYC pending. Orders can be raised and settled manually at the centre.',
    };
  }

  // ── Outstanding balance + instalment plan for one child ──
  private async balanceOf(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { unit: { select: { id: true, code: true, name: true } }, feeTransactions: true },
    });
    if (!s) throw new NotFoundException('Student not found');
    const structure = s.programmeId
      ? await this.prisma.feeStructure.findUnique({
          where: { unitId_programmeId_academicYear: { unitId: s.unitId, programmeId: s.programmeId, academicYear: AY } },
        })
      : null;
    const gross = num(structure?.totalFee);
    const discount = s.siblingGroup ? Math.round(gross * num(structure?.siblingDiscountPct) / 100) : 0;
    const net = gross - discount;
    const paid = s.feeTransactions
      .filter(t => !t.isCancelled && t.ledgerType === 'PRESCHOOL')
      .reduce((a, t) => a + num(t.amount), 0);
    const plan = s.instalmentPlan ?? 'PLAN_C';
    let parts: number[];
    if (plan === 'PLAN_A') {
      const w = [num(structure?.instalment1), num(structure?.instalment2), num(structure?.instalment3)];
      const tw = w[0] + w[1] + w[2] || 1;
      parts = w.map(x => Math.round(net * x / tw));
      parts[2] = net - parts[0] - parts[1];
    } else if (plan === 'PLAN_B') {
      parts = [Math.round(net / 2), net - Math.round(net / 2)];
    } else parts = [net];
    let rem = paid;
    const todayISO = new Date().toISOString().slice(0, 10);
    const instalments = parts.map((amount, i) => {
      const alloc = Math.min(rem, amount); rem -= alloc;
      const dueDate = DUE[plan][i];
      return {
        no: i + 1, amount, dueDate, paid: alloc, balance: amount - alloc,
        status: alloc >= amount ? 'PAID' : dueDate < todayISO ? 'OVERDUE' : 'UPCOMING',
      };
    });
    return { student: s, net, paid, balance: net - paid, plan, instalments };
  }

  private upiUri(amount: number, note: string) {
    const vpa = process.env.UPI_VPA;
    if (!vpa) return null;
    const p = new URLSearchParams({
      pa: vpa,
      pn: process.env.UPI_PAYEE_NAME ?? 'BumbleB Kidz',
      am: amount.toFixed(2),
      cu: 'INR',
      tn: note.slice(0, 50),
    });
    return `upi://pay?${p.toString()}`;
  }

  // ── Create an order (parent "Pay Now", or staff raising a payment link) ──
  @Post('order')
  @UseGuards(AuthGuard)
  async createOrder(@Req() req: any, @Body() b: { studentId: string; amount?: number; instalmentNo?: number; provider?: string }) {
    if (!b?.studentId) throw new BadRequestException('studentId is required');
    const isParent = req.user.role === 'PARENT';
    if (isParent && !req.user.studentIds?.includes(b.studentId)) throw new ForbiddenException('Not your child');

    const { student, balance, instalments } = await this.balanceOf(b.studentId);
    if (!isParent && !HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId) {
      throw new ForbiddenException('Cross-unit access denied');
    }
    if (balance <= 0) throw new BadRequestException('Nothing outstanding — the ledger is fully cleared.');

    // Default to the next unpaid instalment; never allow more than the balance.
    const nextDue = instalments.find(i => i.balance > 0);
    const amount = Math.round(b.amount ?? nextDue?.balance ?? balance);
    if (amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    if (amount > balance) throw new BadRequestException(`Amount exceeds the outstanding balance of ₹${balance.toLocaleString('en-IN')}`);

    const provider = (b.provider ?? (razorpayLive() ? 'RAZORPAY' : process.env.UPI_VPA ? 'UPI_QR' : 'MANUAL')) as any;
    const note = `BumbleB fees ${student.admissionNo}`;
    const live = razorpayLive();

    let providerOrderId: string | null = null;
    if (live && provider === 'RAZORPAY') {
      // Razorpay expects the amount in paise.
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: amount * 100, currency: 'INR', receipt: `${student.admissionNo}-${Date.now()}`,
          notes: { admissionNo: student.admissionNo, unit: student.unit.code, instalmentNo: String(b.instalmentNo ?? nextDue?.no ?? '') },
        }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new BadRequestException(`Razorpay: ${body?.error?.description ?? 'order creation failed'}`);
      providerOrderId = body.id;
    }

    const order = await this.prisma.paymentOrder.create({
      data: {
        studentId: student.id, unitId: student.unitId, amount,
        instalmentNo: b.instalmentNo ?? nextDue?.no ?? null,
        provider, placeholder: !live, providerOrderId,
        upiUri: this.upiUri(amount, note),
        notes: note,
        createdById: isParent ? null : req.user.sub,
      },
    });
    return {
      order,
      live,
      keyId: live ? process.env.RAZORPAY_KEY_ID : null,
      child: { name: `${student.firstName} ${student.lastName}`, admissionNo: student.admissionNo, unit: student.unit.name },
      message: live
        ? null
        : 'Payment gateway is not live yet. Pay by UPI or at the centre — the office will confirm this reference and your receipt will appear here.',
    };
  }

  // ── Parent's own orders ──
  @Get('mine')
  @UseGuards(AuthGuard)
  @Roles('PARENT')
  mine(@Req() req: any) {
    return this.prisma.paymentOrder.findMany({
      where: { studentId: { in: req.user.studentIds ?? [] } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  // ── Staff list of online payment attempts ──
  @Get()
  @UseGuards(AuthGuard)
  list(@Req() req: any, @Query('status') status?: string, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role) ? (unitId ? { unitId } : {}) : { unitId: req.user.unitId };
    return this.prisma.paymentOrder.findMany({
      where: { ...scope, ...(status ? { status: status as any } : {}) },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  // ── Settle an order → fee transaction + receipt + parent notification ──
  // Shared by the webhook (live) and by manual confirmation (placeholder/UPI).
  private async settle(order: any, opts: { mode: string; reference?: string | null; paymentId?: string | null; by?: string | null }) {
    if (order.status === 'PAID') return order; // idempotent — webhooks retry
    const s = await this.prisma.student.findUnique({
      where: { id: order.studentId },
      include: { unit: { select: { id: true, code: true } } },
    });
    if (!s) throw new NotFoundException('Student not found');

    const txn = await issueReceipt(this.prisma, {
      studentId: s.id, unitId: s.unitId, unitCode: s.unit.code,
      amount: num(order.amount), paymentMode: opts.mode,
      ledgerType: order.ledgerType, instalmentNo: order.instalmentNo,
      reference: opts.reference ?? opts.paymentId ?? order.providerOrderId ?? null,
      remarks: `Online payment (${order.provider})`,
      collectedById: opts.by ?? null,
    });

    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID', paidAt: new Date(),
        providerPaymentId: opts.paymentId ?? order.providerPaymentId,
        feeTransactionId: txn.id,
      },
    });

    await notifyParent(this.prisma, {
      type: 'RECEIPT',
      studentId: s.id,
      unitId: s.unitId,
      recipient: s.fatherPhone || s.motherPhone || '',
      payload: { receiptNo: txn.receiptNo, amount: num(order.amount), child: `${s.firstName} ${s.lastName}` },
    });
    return { ...updated, receiptNo: txn.receiptNo };
  }

  // ── Checkout callback from the parent's browser (live mode) ──
  @Post('verify')
  @UseGuards(AuthGuard)
  async verify(@Req() req: any, @Body() b: { orderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: b.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (req.user.role === 'PARENT' && !req.user.studentIds?.includes(order.studentId)) throw new ForbiddenException('Not your child');
    if (!razorpayLive()) throw new BadRequestException('Payment gateway is not live yet');

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${order.providerOrderId}|${b.razorpayPaymentId}`)
      .digest('hex');
    if (expected !== b.razorpaySignature) {
      await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED', failureReason: 'Signature mismatch' } });
      throw new BadRequestException('Payment signature verification failed');
    }
    await this.prisma.paymentOrder.update({ where: { id: order.id }, data: { providerSignature: b.razorpaySignature } });
    return this.settle(order, { mode: 'RAZORPAY', paymentId: b.razorpayPaymentId });
  }

  // ── Razorpay webhook (server-to-server; the authoritative settlement) ──
  // Public by design — authenticity comes from the HMAC signature, not a JWT.
  @Post('webhook')
  async webhook(@Req() req: any, @Body() body: any) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return { ok: true, ignored: 'webhook secret not configured (placeholder mode)' };
    const signature = req.headers['x-razorpay-signature'] as string;
    const raw: Buffer | undefined = req.rawBody;
    const payload = raw ? raw.toString('utf8') : JSON.stringify(body ?? {});
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!signature || expected !== signature) throw new ForbiddenException('Invalid webhook signature');

    const event = body?.event as string;
    const entity = body?.payload?.payment?.entity ?? {};
    const providerOrderId = entity.order_id;
    if (!providerOrderId) return { ok: true, ignored: 'no order id in payload' };
    const order = await this.prisma.paymentOrder.findUnique({ where: { providerOrderId } });
    if (!order) return { ok: true, ignored: 'unknown order' };

    if (event === 'payment.captured' || event === 'order.paid') {
      await this.settle(order, { mode: 'RAZORPAY', paymentId: entity.id, reference: entity.id });
      return { ok: true, settled: true };
    }
    if (event === 'payment.failed') {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', providerPaymentId: entity.id, failureReason: entity.error_description ?? 'Payment failed' },
      });
    }
    return { ok: true, event };
  }

  // ── Manual confirmation (placeholder mode / UPI reference / counter) ──
  @Post(':id/confirm')
  @UseGuards(AuthGuard)
  @Roles(...SETTLE_ROLES)
  async confirm(@Req() req: any, @Param('id') id: string, @Body() b: { reference?: string; mode?: string }) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== order.unitId) throw new ForbiddenException('Cross-unit access denied');
    if (order.status === 'PAID') throw new BadRequestException('This order is already settled');
    const settled = await this.settle(order, {
      mode: b.mode ?? (order.provider === 'UPI_QR' ? 'UPI' : 'RAZORPAY'),
      reference: b.reference ?? null,
      by: req.user.sub,
    });
    await this.audit.log(req, 'payment_orders', order.id, 'UPDATE', order, settled);
    return settled;
  }

  // ── Cancel an abandoned order ──
  @Post(':id/cancel')
  @UseGuards(AuthGuard)
  async cancel(@Req() req: any, @Param('id') id: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (req.user.role === 'PARENT' && !req.user.studentIds?.includes(order.studentId)) throw new ForbiddenException('Not your child');
    if (order.status === 'PAID') throw new BadRequestException('A settled payment cannot be cancelled — use receipt cancellation instead');
    return this.prisma.paymentOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}

@Module({ controllers: [PaymentsController], providers: [PrismaService, AuditService] })
export class PaymentsModule {}

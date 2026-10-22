import { Controller, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { OnlineSettlementService } from './online-settlement.service';
import { captureDecision, parseWebhook } from './payments.rules';
import { createRazorpayAdapter } from './razorpay.adapter';

/**
 * Payment-gateway webhook.
 *
 * Unauthenticated by design (the gateway cannot present a JWT) and therefore
 * authenticated by HMAC instead: the raw body is signed with the webhook
 * secret. Every path answers 200 — Razorpay retries any non-2xx for 24 hours,
 * and a retry storm on an event we deliberately ignore would be self-inflicted.
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly log = new Logger('Webhooks');

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settlement: OnlineSettlementService,
  ) {}

  @Post('razorpay')
  @HttpCode(200)
  async razorpay(@Req() req: any) {
    const raw: string =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : JSON.stringify(req.body ?? {});
    const signature = String(req.headers['x-razorpay-signature'] ?? '');

    if (!createRazorpayAdapter().verifyWebhook(raw, signature)) {
      this.log.warn('Rejected a webhook with a bad or missing signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const parsed = parseWebhook(raw);
    if (parsed.action === 'IGNORE' || !parsed.orderId) {
      return { ok: true, handled: false, event: parsed.event };
    }

    const intent = await this.prisma.onlinePayment.findUnique({
      where: { orderId: parsed.orderId },
    });
    if (!intent) {
      this.log.warn(`Webhook for unknown order ${parsed.orderId}`);
      return { ok: true, handled: false, reason: 'unknown order' };
    }

    if (parsed.action === 'FAIL') {
      if (intent.status === 'CREATED') {
        await this.prisma.onlinePayment.update({
          where: { id: intent.id },
          data: {
            status: 'FAILED',
            providerPaymentId: parsed.paymentId ?? null,
            failureReason: parsed.reason ?? 'Payment failed',
          },
        });
        await this.audit.log(
          { headers: {}, ip: 'razorpay-webhook', user: null },
          'online_payments',
          intent.id,
          'UPDATE',
          intent,
          { status: 'FAILED' },
        );
      }
      return { ok: true, handled: true, status: 'FAILED' };
    }

    const paidRupees = parsed.amountPaise != null ? Number(parsed.amountPaise) / 100 : undefined;
    const decision = captureDecision(intent, paidRupees);
    if (decision === 'REJECT') {
      this.log.warn(
        `Ignored capture for ${intent.orderId}: status=${intent.status} mode=${intent.mode} amount=${intent.amount}`,
      );
      return { ok: true, handled: false, reason: 'not applicable' };
    }
    if (decision === 'REPLAY') {
      // Gateway retry after we already issued the receipt — stay idempotent.
      return { ok: true, handled: true, replay: true, status: 'PAID' };
    }

    const result = await this.settlement.settle(intent, parsed.paymentId ?? null);
    return {
      ok: true,
      handled: true,
      status: 'PAID',
      receiptNo: result.transaction.receiptNo,
    };
  }
}

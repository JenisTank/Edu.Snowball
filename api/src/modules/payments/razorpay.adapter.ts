import { Logger } from '@nestjs/common';

import { env } from '../../config/env';
import { checkoutSignature, hmacHex, mockOrderId, signatureMatches } from './payments.rules';

/**
 * Razorpay behind a port.
 *
 * The client has not completed merchant KYC yet, so the whole online-payment
 * flow ships against `MockRazorpayAdapter`: orders are deterministic, the
 * checkout signature maths is identical, and — critically — a mock capture
 * never writes a FeeTransaction. When `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`
 * land in the environment, `createRazorpayAdapter()` switches to the live
 * implementation with no other code change.
 */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayAdapter {
  readonly mode: 'LIVE' | 'MOCK';
  readonly keyId: string;
  createOrder(input: CreateOrderInput): Promise<RazorpayOrder>;
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

class MockRazorpayAdapter implements RazorpayAdapter {
  readonly mode = 'MOCK' as const;
  readonly keyId = '';
  private readonly salt = 'bumbleb-sandbox';

  async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    return {
      id: mockOrderId(input.receipt, input.amountPaise, this.salt),
      amount: input.amountPaise,
      currency: 'INR',
      status: 'created',
      receipt: input.receipt,
    };
  }

  /** Same HMAC scheme as live, keyed with the sandbox salt. */
  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    return signatureMatches(checkoutSignature(orderId, paymentId, this.salt), signature);
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    return signatureMatches(hmacHex(this.salt, rawBody), signature);
  }
}

class LiveRazorpayAdapter implements RazorpayAdapter {
  readonly mode = 'LIVE' as const;
  readonly keyId = env.razorpayKeyId;
  private readonly log = new Logger('Razorpay');

  async createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
    const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');
    const res = await fetch(`${env.razorpayBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes ?? {},
        payment_capture: 1,
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.log.error(`Order creation failed (${res.status}): ${body?.error?.description ?? ''}`);
      throw new Error(body?.error?.description ?? 'Payment gateway rejected the order');
    }
    return body as RazorpayOrder;
  }

  verifyCheckout(orderId: string, paymentId: string, signature: string): boolean {
    return signatureMatches(
      checkoutSignature(orderId, paymentId, env.razorpayKeySecret),
      signature,
    );
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!env.razorpayWebhookSecret) return false;
    return signatureMatches(hmacHex(env.razorpayWebhookSecret, rawBody), signature);
  }
}

let adapter: RazorpayAdapter | null = null;

/** Lazily built so tests can flip the environment before the first call. */
export function createRazorpayAdapter(): RazorpayAdapter {
  if (!adapter) adapter = env.razorpayMock ? new MockRazorpayAdapter() : new LiveRazorpayAdapter();
  return adapter;
}

/** Test seam: forget the memoised adapter. */
export function resetRazorpayAdapter(): void {
  adapter = null;
}

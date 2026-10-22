import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Razorpay integration rules — pure functions so the money maths and the
 * signature checks are unit-tested without a network or a database.
 */

/** Razorpay works in paise; rupees arrive from a form as a float. */
export function paiseFromRupees(amount: number, cap = 200000): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');
  const paise = Math.round(amount * 100);
  if (paise > Math.round(cap * 100)) throw new Error(`Amount exceeds the ₹${cap} online limit`);
  if (Math.abs(amount * 100 - paise) > 0.001)
    throw new Error('Amount cannot have more than 2 decimals');
  return paise;
}

export function rupeesFromPaise(paise: number): number {
  return Math.round(Number(paise) || 0) / 100;
}

/** HMAC-SHA256 hex digest — what Razorpay signs webhooks and checkout payloads with. */
export function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison; a plain `===` leaks timing information. */
export function signatureMatches(expectedHex: string, givenHex: string): boolean {
  if (!expectedHex || !givenHex) return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(givenHex, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Checkout handshake: `order_id|payment_id` signed with the key secret. */
export function checkoutSignature(orderId: string, paymentId: string, keySecret: string): string {
  return hmacHex(keySecret, `${orderId}|${paymentId}`);
}

/** Deterministic sandbox order id — same input, same id, so retries are safe. */
export function mockOrderId(studentId: string, amountPaise: number, salt: string): string {
  const digest = createHash('sha1').update(`${studentId}:${amountPaise}:${salt}`).digest('hex');
  return `order_mock_${digest.slice(0, 18)}`;
}

export type WebhookAction = 'CAPTURE' | 'FAIL' | 'IGNORE';

export interface ParsedWebhook {
  action: WebhookAction;
  event: string;
  orderId?: string;
  paymentId?: string;
  amountPaise?: number;
  reason?: string;
}

const CAPTURE_EVENTS = new Set(['payment.captured', 'payment.authorized', 'order.paid']);
const FAIL_EVENTS = new Set(['payment.failed']);

/**
 * Translate a Razorpay webhook into one of three actions.
 *
 * Unknown events are IGNORE rather than an error: Razorpay retries any non-2xx
 * response for 24 hours, so a 400 on an event we do not care about would turn
 * into a retry storm.
 */
export function parseWebhook(raw: string): ParsedWebhook {
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return { action: 'IGNORE', event: 'unparseable' };
  }
  const event: string = body?.event ?? 'unknown';
  const entity = body?.payload?.payment?.entity ?? {};
  const orderEntity = body?.payload?.order?.entity ?? {};
  const orderId: string | undefined = entity.order_id ?? orderEntity.id;
  const paymentId: string | undefined = entity.id;
  const amountPaise: number | undefined =
    entity.amount != null
      ? Number(entity.amount)
      : orderEntity.amount != null
        ? Number(orderEntity.amount)
        : undefined;
  const reason: string | undefined = entity.error_description ?? entity.error_reason ?? undefined;

  if (CAPTURE_EVENTS.has(event)) {
    return { action: orderId ? 'CAPTURE' : 'IGNORE', event, orderId, paymentId, amountPaise };
  }
  if (FAIL_EVENTS.has(event)) {
    return { action: orderId ? 'FAIL' : 'IGNORE', event, orderId, paymentId, amountPaise, reason };
  }
  return { action: 'IGNORE', event };
}

/**
 * A capture may only create a receipt once. Returns 'CREATE' for a fresh
 * CREATED intent, 'REPLAY' when the same payment already produced a receipt
 * (webhook retry), and 'REJECT' when the webhook contradicts our records.
 */
export function captureDecision(
  intent: { status: string; mode: string; transactionId?: string | null; amount: number },
  paidRupees: number | undefined,
): 'CREATE' | 'REPLAY' | 'REJECT' {
  if (intent.mode !== 'LIVE') return 'REJECT';
  if (intent.status === 'PAID' || intent.transactionId) return 'REPLAY';
  if (intent.status !== 'CREATED') return 'REJECT';
  if (paidRupees != null && Math.round(paidRupees * 100) !== Math.round(intent.amount * 100))
    return 'REJECT';
  return 'CREATE';
}

/** Parent-facing label for the intent state. */
export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'FAILED':
      return 'Failed';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Awaiting payment';
  }
}

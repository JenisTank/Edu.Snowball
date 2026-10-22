import { createHmac } from 'crypto';
import {
  captureDecision,
  checkoutSignature,
  hmacHex,
  mockOrderId,
  paiseFromRupees,
  parseWebhook,
  paymentStatusLabel,
  rupeesFromPaise,
  signatureMatches,
} from '../src/modules/payments/payments.rules';
import {
  createRazorpayAdapter,
  resetRazorpayAdapter,
} from '../src/modules/payments/razorpay.adapter';

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('hex');

describe('online payment maths', () => {
  it('converts rupees to paise without float drift', () => {
    expect(paiseFromRupees(4500)).toBe(450000);
    expect(paiseFromRupees(1234.56)).toBe(123456);
    expect(paiseFromRupees(0.1 + 0.2)).toBe(30);
    expect(rupeesFromPaise(123456)).toBe(1234.56);
  });

  it('rejects zero, negative, over-precise and oversized amounts', () => {
    expect(() => paiseFromRupees(0)).toThrow(/greater than zero/);
    expect(() => paiseFromRupees(-10)).toThrow(/greater than zero/);
    expect(() => paiseFromRupees(10.005)).toThrow(/2 decimals/);
    expect(() => paiseFromRupees(500000, 200000)).toThrow(/limit/);
  });

  it('compares signatures in constant time and rejects mismatches', () => {
    const good = sign('secret', 'payload');
    expect(signatureMatches(good, good)).toBe(true);
    expect(signatureMatches(good, sign('other', 'payload'))).toBe(false);
    expect(signatureMatches(good, good.slice(0, -2))).toBe(false);
    expect(signatureMatches('', '')).toBe(false);
  });

  it('signs the checkout handshake the way Razorpay does', () => {
    expect(checkoutSignature('order_1', 'pay_1', 'k')).toBe(sign('k', 'order_1|pay_1'));
  });
});

describe('webhook translation', () => {
  const body = (event: string, extra: any = {}) =>
    JSON.stringify({
      event,
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_123',
            amount: 450000,
            ...extra,
          },
        },
      },
    });

  it('maps a capture to CAPTURE with the order and amount', () => {
    const p = parseWebhook(body('payment.captured'));
    expect(p).toMatchObject({
      action: 'CAPTURE',
      orderId: 'order_123',
      paymentId: 'pay_123',
      amountPaise: 450000,
    });
  });

  it('maps a failure and keeps the gateway reason', () => {
    const p = parseWebhook(body('payment.failed', { error_description: 'insufficient funds' }));
    expect(p.action).toBe('FAIL');
    expect(p.reason).toBe('insufficient funds');
  });

  it('ignores unknown events instead of erroring (no retry storms)', () => {
    expect(parseWebhook(body('refund.created')).action).toBe('IGNORE');
    expect(parseWebhook('not json').action).toBe('IGNORE');
  });
});

describe('capture idempotency', () => {
  const live = { status: 'CREATED', mode: 'LIVE', amount: 4500 };

  it('creates a receipt once for a fresh live intent', () => {
    expect(captureDecision(live, 4500)).toBe('CREATE');
  });

  it('replays instead of double-charging on a gateway retry', () => {
    expect(captureDecision({ ...live, status: 'PAID' }, 4500)).toBe('REPLAY');
    expect(captureDecision({ ...live, transactionId: 'txn_1' }, 4500)).toBe('REPLAY');
  });

  it('refuses sandbox captures, stale intents and amount mismatches', () => {
    expect(captureDecision({ ...live, mode: 'MOCK' }, 4500)).toBe('REJECT');
    expect(captureDecision({ ...live, status: 'EXPIRED' }, 4500)).toBe('REJECT');
    expect(captureDecision(live, 100)).toBe('REJECT');
    // A webhook without an amount is trusted once the signature verified.
    expect(captureDecision(live, undefined)).toBe('CREATE');
  });

  it('labels every state for the parent screen', () => {
    expect(paymentStatusLabel('PAID')).toBe('Paid');
    expect(paymentStatusLabel('CREATED')).toBe('Awaiting payment');
  });
});

describe('sandbox adapter', () => {
  beforeEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    resetRazorpayAdapter();
  });

  it('runs in mock mode when merchant keys are absent', () => {
    const gw = createRazorpayAdapter();
    expect(gw.mode).toBe('MOCK');
    expect(gw.keyId).toBe('');
  });

  it('creates deterministic orders so a retried request is harmless', async () => {
    const gw = createRazorpayAdapter();
    const a = await gw.createOrder({ amountPaise: 450000, receipt: 'intent-1' });
    const b = await gw.createOrder({ amountPaise: 450000, receipt: 'intent-1' });
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(mockOrderId('intent-1', 450000, 'bumbleb-sandbox'));
    expect(a.currency).toBe('INR');
  });

  it('verifies the checkout handshake with the sandbox salt', async () => {
    const gw = createRazorpayAdapter();
    const order = await gw.createOrder({ amountPaise: 100000, receipt: 'intent-2' });
    expect(gw.verifyCheckout(order.id, 'pay_1', sign('bumbleb-sandbox', `${order.id}|pay_1`))).toBe(
      true,
    );
    expect(gw.verifyCheckout(order.id, 'pay_1', 'bogus')).toBe(false);
  });

  it('verifies webhooks over the raw body', () => {
    const gw = createRazorpayAdapter();
    const raw = JSON.stringify({ event: 'payment.captured' });
    expect(gw.verifyWebhook(raw, hmacHex('bumbleb-sandbox', raw))).toBe(true);
    expect(gw.verifyWebhook(raw, 'nope')).toBe(false);
  });
});

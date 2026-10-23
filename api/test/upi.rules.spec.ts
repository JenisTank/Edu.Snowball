import {
  buildUpiLink,
  claimDecision,
  isValidPayerRef,
  isValidVpa,
  payableAmount,
  paymentStatusLabel,
  sanitiseNote,
  upiAmount,
} from '../src/modules/payments/upi.rules';

describe('UPI intent grammar', () => {
  it('formats the amount the way UPI apps demand', () => {
    expect(upiAmount(4500)).toBe('4500.00');
    expect(upiAmount(1234.5)).toBe('1234.50');
    expect(upiAmount(0.1 + 0.2)).toBe('0.30');
    expect(() => upiAmount(0)).toThrow(/greater than zero/);
    expect(() => upiAmount(10.005)).toThrow(/2 decimals/);
  });

  it('accepts real VPA shapes and rejects typos', () => {
    expect(isValidVpa('bumbleb.kidz@okhdfcbank')).toBe(true);
    expect(isValidVpa('9876543210@ybl')).toBe(true);
    expect(isValidVpa('bumbleb@')).toBe(false);
    expect(isValidVpa('bumbleb')).toBe(false);
    expect(isValidVpa('')).toBe(false);
    expect(isValidVpa(null)).toBe(false);
  });

  it('strips characters that would break the URI', () => {
    expect(sanitiseNote('K1 fees & books?')).toBe('K1 fees books');
    expect(sanitiseNote('line\nbreak')).toBe('line break');
    expect(sanitiseNote('x'.repeat(80)).length).toBe(50);
  });

  it('builds a payable upi:// link with the reference quoted', () => {
    const link = buildUpiLink({
      vpa: 'bumbleb.kidz@okhdfcbank',
      payeeName: 'BumbleB Kidz',
      amount: 4500,
      reference: 'BBABC123',
      note: 'BB-U1-2627-0042 fees',
    });
    expect(link.startsWith('upi://pay?')).toBe(true);
    expect(link).toContain('pa=bumbleb.kidz%40okhdfcbank');
    expect(link).toContain('pn=BumbleB%20Kidz');
    expect(link).toContain('am=4500.00');
    expect(link).toContain('cu=INR');
    expect(link).toContain('tr=BBABC123');
    expect(link).toContain('tn=BB-U1-2627-0042%20fees');
  });

  it('refuses to build a link for a bad VPA', () => {
    expect(() =>
      buildUpiLink({ vpa: 'nope', payeeName: 'BumbleB', amount: 10, reference: 'R1' }),
    ).toThrow(/not a UPI id/);
  });

  it('encodes a rupee amount exactly, with no float drift', () => {
    const link = buildUpiLink({
      vpa: 'ab@cd',
      payeeName: 'X',
      amount: 1050.35,
      reference: 'R1',
    });
    expect(link).toContain('am=1050.35');
  });
});

describe('how much may be paid', () => {
  it('defaults to the whole balance', () => {
    expect(payableAmount(undefined, 4500)).toBe(4500);
  });

  it('allows a part payment', () => {
    expect(payableAmount(1000, 4500)).toBe(1000);
  });

  it('refuses an overpayment, a zero amount, or nothing outstanding', () => {
    expect(() => payableAmount(5000, 4500)).toThrow(/exceed the outstanding balance/);
    expect(() => payableAmount(0, 4500)).toThrow(/greater than zero/);
    expect(() => payableAmount(100, 0)).toThrow(/Nothing is outstanding/);
  });

  it('respects the single-payment cap', () => {
    expect(() => payableAmount(150000, 200000)).toThrow(/limited to ₹100000/);
    expect(payableAmount(90000, 200000)).toBe(90000);
  });
});

describe('claim state machine', () => {
  const fresh = { status: 'CREATED', createdAt: new Date() };

  it('claims a fresh intent', () => {
    expect(claimDecision(fresh, 'ABC12345')).toBe('CLAIM');
  });

  it('replays a claim or a paid intent instead of double-booking', () => {
    expect(claimDecision({ status: 'CLAIMED' }, 'ABC12345')).toBe('REPLAY');
    expect(claimDecision({ status: 'PAID' }, 'ABC12345')).toBe('REPLAY');
  });

  it('rejects a blank or malformed reference, a failed intent and an expired QR', () => {
    expect(claimDecision(fresh, '   ')).toBe('REJECT');
    expect(claimDecision(fresh, 'paid')).toBe('REJECT');
    expect(claimDecision(fresh, 'abc-123-xyz')).toBe('REJECT');
    expect(claimDecision({ status: 'FAILED' }, 'ABC12345')).toBe('REJECT');
    const stale = { status: 'CREATED', createdAt: new Date(Date.now() - 72 * 3600_000) };
    expect(claimDecision(stale, 'ABC12345')).toBe('REJECT');
  });

  it('recognises a UTR but not free text', () => {
    expect(isValidPayerRef('412345678901')).toBe(true);
    expect(isValidPayerRef('abc-123-xyz')).toBe(false);
    expect(isValidPayerRef('paid')).toBe(false);
    expect(isValidPayerRef('')).toBe(false);
  });

  it('labels every state for the parent', () => {
    expect(paymentStatusLabel('PAID')).toBe('Paid');
    expect(paymentStatusLabel('CLAIMED')).toBe('Awaiting confirmation');
    expect(paymentStatusLabel('CREATED')).toBe('Awaiting payment');
  });
});

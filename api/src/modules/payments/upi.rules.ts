/**
 * UPI collection without a gateway.
 *
 * The centre publishes its own VPA. The parent app builds a `upi://pay` intent
 * for the exact amount owed and renders it as a QR; any UPI app reads it and
 * pays the centre directly. Nothing is charged by a payment aggregator, so
 * there is no KYC, no per-transaction fee and no merchant onboarding.
 *
 * The trade-off is honest and worth stating: **we cannot see the money move.**
 * A UPI credit lands in the centre's bank account, not in this database, so the
 * flow is two-step — the parent reports the UTR (`claim`), and the front desk
 * matches it against the bank statement (`confirm`) before a receipt exists.
 * `claim` never books revenue; only `confirm` does.
 *
 * Every function here is pure so the URI grammar and the state machine are
 * unit-tested without a phone, a bank or a database.
 */

/** NPCI caps a single UPI payment at ₹1,00,000 for most banks. */
export const UPI_MAX_RUPEES = 100000;

/** The amount, always two decimals — UPI apps reject `am=4500.5`. */
export function upiAmount(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees <= 0) throw new Error('Amount must be greater than zero');
  if (Math.abs(rupees * 100 - Math.round(rupees * 100)) > 0.001)
    throw new Error('Amount cannot have more than 2 decimals');
  return rupees.toFixed(2);
}

/**
 * VPA grammar: `handle@psp`, where the handle allows letters, digits, dot,
 * hyphen and underscore. Rejecting at write time means a typo in Settings
 * cannot produce a QR that quietly pays nobody.
 */
export function isValidVpa(vpa: string | null | undefined): boolean {
  if (!vpa) return false;
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(vpa.trim());
}

/** Notes ride inside a URI: reserved characters and newlines must go. */
export function sanitiseNote(note: string, maxLength = 50): string {
  return note
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[&?=%#+]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export interface UpiIntentInput {
  vpa: string;
  payeeName: string;
  amount: number;
  /** Our reference — quoted in the note and in the transaction reference. */
  reference: string;
  note?: string;
}

/**
 * Build the `upi://pay` URI. Field order follows the NPCI spec so that every
 * app parses it; the reference (`tr`) is what lets the front desk find the
 * credit on the bank statement.
 */
export function buildUpiLink(input: UpiIntentInput): string {
  if (!isValidVpa(input.vpa)) throw new Error(`"${input.vpa}" is not a UPI id (name@bank)`);
  const payee = sanitiseNote(input.payeeName, 40) || 'BumbleB Kidz';
  const params = [
    `pa=${encodeURIComponent(input.vpa.trim())}`,
    `pn=${encodeURIComponent(payee)}`,
    `am=${upiAmount(input.amount)}`,
    'cu=INR',
    `tr=${encodeURIComponent(input.reference)}`,
  ];
  const note = sanitiseNote(input.note ?? '');
  if (note) params.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${params.join('&')}`;
}

/**
 * Amount check for a self-service payment. The parent may pay part of a bill
 * (many families do), but never more than the balance or beyond the UPI cap.
 */
export function payableAmount(
  requested: number | undefined,
  outstanding: number,
  cap = UPI_MAX_RUPEES,
): number {
  const balance = Math.round(Math.max(0, outstanding) * 100) / 100;
  if (balance <= 0) throw new Error('Nothing is outstanding on this account');
  const amount = requested == null ? balance : Math.round(requested * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');
  if (amount > balance)
    throw new Error(`Amount cannot exceed the outstanding balance of ₹${balance.toFixed(2)}`);
  if (amount > cap) throw new Error(`A single UPI payment is limited to ₹${cap}`);
  return amount;
}

export type ClaimDecision = 'CLAIM' | 'REPLAY' | 'REJECT';

/**
 * A parent pressing "I have paid" is a claim, not a receipt.
 *
 * Replay keeps the screen idempotent when a parent taps twice or the phone
 * retries; a paid intent is never reopened, and an expired one needs a fresh
 * QR rather than an argument at the desk.
 */
export function claimDecision(
  intent: { status: string; claimedAt?: Date | string | null; createdAt?: Date | string | null },
  payerRef: string,
  now: Date = new Date(),
  expiresHours = 48,
): ClaimDecision {
  if (!payerRef.trim()) return 'REJECT';
  if (intent.status === 'PAID') return 'REPLAY';
  if (intent.status === 'CLAIMED') return 'REPLAY';
  if (intent.status !== 'CREATED') return 'REJECT';
  if (intent.createdAt) {
    const age = now.getTime() - new Date(intent.createdAt).getTime();
    if (age > expiresHours * 3600_000) return 'REJECT';
  }
  return 'CLAIM';
}

/** A UTR is 12 digits for IMPS/NEFT; UPI references are alphanumeric, 12–22. */
export function isValidPayerRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  const v = ref.trim().replace(/\s+/g, '');
  return /^[A-Za-z0-9]{8,24}$/.test(v);
}

/** Parent-facing label for the intent state. */
export function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'CLAIMED':
      return 'Awaiting confirmation';
    case 'FAILED':
      return 'Failed';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Awaiting payment';
  }
}

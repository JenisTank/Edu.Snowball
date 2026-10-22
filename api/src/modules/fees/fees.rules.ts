/**
 * Fee ledger rules — pure functions, no database access.
 *
 * These encode the numbers the business depends on:
 *  - sibling concession (percentage stored on the HO-locked fee structure)
 *  - instalment plans A / B / C and their due dates
 *  - allocation of payments to instalments, and overdue detection
 *  - reminder stages T-5 / T-0 / T+3 / T+7
 *  - receipt and certificate serials (sequential per unit, never reused)
 */

export const ACADEMIC_YEAR = '2026-27';
export const ACADEMIC_YEAR_SHORT = '2627';
const AY_START_YEAR = 2026;

export type InstalmentPlan = 'PLAN_A' | 'PLAN_B' | 'PLAN_C';
export type LedgerType = 'PRESCHOOL' | 'EVENING';

/** Plan A = Apr / Jul / Oct · Plan B = Apr / Oct · Plan C = full at admission. */
export const DUE_DATES: Record<InstalmentPlan, string[]> = {
  PLAN_A: [`${AY_START_YEAR}-04-10`, `${AY_START_YEAR}-07-10`, `${AY_START_YEAR}-10-10`],
  PLAN_B: [`${AY_START_YEAR}-04-10`, `${AY_START_YEAR}-10-10`],
  PLAN_C: [`${AY_START_YEAR}-04-10`],
};

export interface FeeStructureLike {
  totalFee?: number | string | null;
  siblingDiscountPct?: number | string | null;
  instalment1?: number | string | null;
  instalment2?: number | string | null;
  instalment3?: number | string | null;
}

export interface Instalment {
  no: number;
  amount: number;
  dueDate: string;
  paid: number;
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PARTIAL · OVERDUE' | 'UPCOMING';
}

export interface FeeSchedule {
  gross: number;
  discount: number;
  discPct: number;
  net: number;
  instalments: { no: number; amount: number; dueDate: string }[];
}

export const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

/** Sibling concession in rupees, rounded to the nearest rupee. */
export function siblingConcession(gross: number, pct: number): number {
  if (!pct || pct <= 0) return 0;
  return Math.round((gross * pct) / 100);
}

/**
 * Build the payment schedule for one student.
 * Instalments split by the structure's own weights, with the final instalment
 * absorbing rounding so the parts always add up to `net` exactly.
 */
export function buildSchedule(
  structure: FeeStructureLike | null | undefined,
  plan: InstalmentPlan | string,
  hasSibling: boolean,
): FeeSchedule {
  const gross = num(structure?.totalFee);
  const discPct = hasSibling ? num(structure?.siblingDiscountPct) : 0;
  const discount = siblingConcession(gross, discPct);
  const net = gross - discount;

  let parts: number[];
  if (plan === 'PLAN_A') {
    const w = [
      num(structure?.instalment1),
      num(structure?.instalment2),
      num(structure?.instalment3),
    ];
    const total = w[0] + w[1] + w[2] || 1;
    parts = w.map((x) => Math.round((net * x) / total));
    parts[2] = net - parts[0] - parts[1];
  } else if (plan === 'PLAN_B') {
    parts = [Math.round(net / 2), net - Math.round(net / 2)];
  } else {
    parts = [net];
  }

  const dues =
    DUE_DATES[(plan as InstalmentPlan) in DUE_DATES ? (plan as InstalmentPlan) : 'PLAN_C'];
  return {
    gross,
    discount,
    discPct,
    net,
    instalments: parts.map((amount, i) => ({ no: i + 1, amount, dueDate: dues[i] })),
  };
}

export interface TransactionLike {
  amount: number | string;
  isCancelled?: boolean;
  ledgerType?: string;
}

export interface StudentLedger extends FeeSchedule {
  plan: string;
  paid: number;
  balance: number;
  overdue: number;
  instalments: Instalment[];
}

/**
 * Allocate collected money to instalments in order and classify each one.
 * Only the preschool ledger counts — the dual-ledger rule keeps evening
 * payments out of the school fee balance.
 */
export function buildLedger(
  schedule: FeeSchedule,
  plan: string,
  transactions: TransactionLike[],
  todayISO: string,
  ledgerType: LedgerType = 'PRESCHOOL',
): StudentLedger {
  const paid = transactions
    .filter((t) => !t.isCancelled && (t.ledgerType ?? 'PRESCHOOL') === ledgerType)
    .reduce((sum, t) => sum + num(t.amount), 0);

  let remaining = paid;
  const instalments: Instalment[] = schedule.instalments.map((inst) => {
    const alloc = Math.min(remaining, inst.amount);
    remaining -= alloc;
    const status: Instalment['status'] =
      alloc >= inst.amount
        ? 'PAID'
        : inst.dueDate < todayISO
          ? alloc > 0
            ? 'PARTIAL · OVERDUE'
            : 'OVERDUE'
          : alloc > 0
            ? 'PARTIAL'
            : 'UPCOMING';
    return { ...inst, paid: alloc, status };
  });

  const overdue = instalments
    .filter((i) => i.status.includes('OVERDUE'))
    .reduce((sum, i) => sum + (i.amount - i.paid), 0);

  return {
    plan,
    ...schedule,
    paid,
    balance: schedule.net - paid,
    overdue,
    instalments,
  };
}

export type ReminderStage = 'T-5' | 'T-0' | 'T+3' | 'T+7';

/** Reminder cadence around a due date (negative = before the due date). */
export function reminderStage(daysFromDue: number): ReminderStage | null {
  if (daysFromDue >= -5 && daysFromDue < 0) return 'T-5';
  if (daysFromDue === 0) return 'T-0';
  if (daysFromDue >= 3 && daysFromDue < 7) return 'T+3';
  if (daysFromDue >= 7) return 'T+7';
  return null;
}

/** Whole days between a due date (YYYY-MM-DD) and today (positive = overdue). */
export function daysFromDue(dueDate: string, todayISO: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const today = new Date(`${todayISO}T00:00:00Z`).getTime();
  return Math.round((today - due) / 86_400_000);
}

/**
 * Next serial in a per-unit sequence, e.g. `BB-U1-RCPT-2627-` → 42.
 * Serials are never reused: cancelled receipts keep consuming their number.
 */
export function nextSerial(prefix: string, lastSerialNo: string | null | undefined): number {
  if (!lastSerialNo || !lastSerialNo.startsWith(prefix)) return 1;
  const n = parseInt(lastSerialNo.slice(prefix.length), 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

export function formatSerial(prefix: string, serial: number): string {
  return `${prefix}${String(serial).padStart(4, '0')}`;
}

/** Receipt number for a collection: BB-U?-RCPT-2627-NNNN. */
export function receiptNo(unitCode: string, serial: number): string {
  return formatSerial(`BB-${unitCode}-RCPT-${ACADEMIC_YEAR_SHORT}-`, serial);
}

/** Certificate serial: BB-U?-CERT-2627-NNNN. */
export function certificateNo(unitCode: string, serial: number): string {
  return formatSerial(`BB-${unitCode}-CERT-${ACADEMIC_YEAR_SHORT}-`, serial);
}

/** Admission number assigned at confirmation: BB-U?-2627-NNNN. */
export function admissionNo(unitCode: string, serial: number): string {
  return formatSerial(`BB-${unitCode}-${ACADEMIC_YEAR_SHORT}-`, serial);
}

/**
 * Employee self-service rules.
 *
 * Kept pure: the window checks and month maths are the bits that quietly break
 * payroll disputes, so they are unit-tested rather than trusted.
 */

export const LEAVE_TYPES = ['CL', 'SL', 'PL'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Inclusive calendar days, matching how HR files leave on paper. */
export function leaveDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

export interface LeaveWindowResult {
  ok: boolean;
  days: number;
  error?: string;
}

/**
 * A self-service application must be a sane window: end after start, no more
 * than 60 days at once, and not backdated beyond 30 days (payroll for older
 * months is already locked).
 */
export function validateLeaveWindow(
  fromDate: string,
  toDate: string,
  todayISO: string,
  maxDays = 60,
): LeaveWindowResult {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to))
    return { ok: false, days: 0, error: 'Enter both dates as YYYY-MM-DD' };

  const days = Math.floor((to - from) / 86400000) + 1;
  if (days < 1)
    return { ok: false, days, error: 'The end date must be on or after the start date' };
  if (days > maxDays)
    return { ok: false, days, error: `A single application cannot exceed ${maxDays} days` };

  const today = new Date(`${todayISO}T00:00:00Z`).getTime();
  if (from < today - 30 * 86400000)
    return { ok: false, days, error: 'Leave cannot be applied for more than 30 days in the past' };

  return { ok: true, days };
}

/** Does [from,to] overlap an existing leave period? */
export function overlaps(
  fromDate: string,
  toDate: string,
  existing: { fromDate: string; toDate: string; status: string }[],
): boolean {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return existing.some((e) => {
    if (e.status === 'REJECTED' || e.status === 'CANCELLED') return false;
    const ef = new Date(`${e.fromDate}T00:00:00Z`).getTime();
    const et = new Date(`${e.toDate}T00:00:00Z`).getTime();
    return from <= et && ef <= to;
  });
}

/** `2026-10` → the inclusive UTC bounds used to query attendance rows. */
export function monthBounds(month: string): { start: Date; end: Date; valid: boolean } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return { start: new Date(0), end: new Date(0), valid: false };
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start, end, valid: true };
}

/** Only finalised payroll runs are visible to the employee. */
export const VISIBLE_RUN_STATUSES = ['APPROVED', 'LOCKED', 'PAID', 'FINALISED'];

export function isPayslipVisible(status: string): boolean {
  return VISIBLE_RUN_STATUSES.includes(status);
}

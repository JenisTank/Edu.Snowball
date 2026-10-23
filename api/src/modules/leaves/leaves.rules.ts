/**
 * Student leave rules — pure functions, no database access.
 *
 * Leave is the *only* thing that suppresses the absence-alert chain. The
 * default-ABSENT rule stays intact: an approved leave means "we know and the
 * family told us", so parents are not messaged and no admin call is raised.
 */

export const LEAVE_TYPES = ['PLANNED', 'SICK', 'FAMILY', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Statuses that suppress absence alerts. Only APPROVED qualifies. */
export const SUPPRESSING_STATUSES: LeaveStatus[] = ['APPROVED'];

export const MAX_LEAVE_DAYS = 30;

/** ISO date (YYYY-MM-DD) for a Date, in India Standard Time. */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Calendar days between two ISO dates, inclusive. */
export function daysInclusive(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.floor((to - from) / 86_400_000) + 1;
}

/** Every ISO date in a range, inclusive. */
export function datesInclusive(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export interface LeaveRange {
  fromDate: string;
  toDate: string;
}

/**
 * Validate a leave request. Returns an error message, or null when valid.
 *
 * Rules:
 *  - the range must be real and ordered
 *  - no more than MAX_LEAVE_DAYS per request
 *  - a leave may start in the past (a parent reporting illness late) but may
 *    not end more than a year out
 *  - the reason must be present and specific enough to act on
 */
export function validateLeave(input: {
  fromDate?: string;
  toDate?: string;
  reason?: string;
  todayISO?: string;
}): string | null {
  const { fromDate, toDate, reason } = input;
  const today = input.todayISO ?? istDateKey();
  if (!fromDate || !toDate) return 'From and to dates are required';
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(fromDate) || !iso.test(toDate)) return 'Dates must be YYYY-MM-DD';
  if (fromDate > toDate) return 'The leave cannot end before it starts';
  const days = daysInclusive(fromDate, toDate);
  if (days < 1) return 'The leave must cover at least one day';
  if (days > MAX_LEAVE_DAYS) return `A single leave may not exceed ${MAX_LEAVE_DAYS} days`;
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  if (new Date(`${toDate}T00:00:00Z`) > horizon) return 'The leave ends too far in the future';
  if (!reason?.trim()) return 'A reason is required so the centre can plan cover';
  if (reason.trim().length < 3) return 'Please add a little more detail to the reason';
  return null;
}

/** Does a leave range cover the given ISO date? */
export function coversDate(leave: LeaveRange, dateISO: string): boolean {
  const from = leave.fromDate.slice(0, 10);
  const to = leave.toDate.slice(0, 10);
  return dateISO >= from && dateISO <= to;
}

/** Do two ranges overlap (inclusive)? */
export function rangesOverlap(a: LeaveRange, b: LeaveRange): boolean {
  return (
    a.fromDate.slice(0, 10) <= b.toDate.slice(0, 10) &&
    b.fromDate.slice(0, 10) <= a.toDate.slice(0, 10)
  );
}

/**
 * Pick the leave that suppresses alerts for a student on a date.
 * An approved leave wins; pending or rejected leave never suppresses.
 */
export function suppressingLeave<T extends LeaveRange & { status: string }>(
  leaves: T[],
  dateISO: string,
): T | null {
  return (
    leaves.find(
      (l) => SUPPRESSING_STATUSES.includes(l.status as LeaveStatus) && coversDate(l, dateISO),
    ) ?? null
  );
}

/**
 * A leave may only be cancelled by its owner before it starts, and only while
 * it has not already been rejected.
 */
export function canCancel(status: string, fromISO: string, todayISO = istDateKey()): boolean {
  return (status === 'PENDING' || status === 'APPROVED') && fromISO > todayISO;
}

/** Only a pending leave can be approved or rejected. */
export function canDecide(status: string): boolean {
  return status === 'PENDING';
}

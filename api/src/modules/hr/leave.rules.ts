/**
 * Staff-leave cut-off rules — pure functions, no database access.
 *
 * A leave sits at `PENDING_MANAGER` (or `PENDING_HR`) until someone approves
 * it. If nobody decides by the time the leave is over, payroll must not keep
 * waiting: the days are unapproved absence and are paid as leave-without-pay.
 * This is the "auto-LWP at cutoff" rule from the HR spec.
 */

/** Statuses that are still awaiting a decision. */
export const PENDING_LEAVE_STATUSES = ['PENDING_MANAGER', 'PENDING_HR'] as const;
export type PendingLeaveStatus = (typeof PENDING_LEAVE_STATUSES)[number];

/** Written when the cut-off job closes an undecided leave. */
export const AUTO_LWP_STATUS = 'AUTO_LWP';

const isoOf = (d: string | Date): string =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/**
 * True when a leave is undecided *and* its last day has already passed.
 * The cut-off is deliberately strict: a leave ending today can still be
 * approved today, so only `toDate < today` is overdue.
 */
export function isOverduePendingLeave(
  leave: { status: string; toDate: string | Date },
  todayISO: string,
): boolean {
  if (!(PENDING_LEAVE_STATUSES as readonly string[]).includes(leave.status)) return false;
  return isoOf(leave.toDate) < todayISO;
}

/** The leaves the cut-off job should close, in a stable order. */
export function overdueLeaves<T extends { status: string; toDate: string | Date }>(
  leaves: T[],
  todayISO: string,
): T[] {
  return leaves
    .filter((l) => isOverduePendingLeave(l, todayISO))
    .sort((a, b) => isoOf(a.toDate).localeCompare(isoOf(b.toDate)));
}

/** What the run will report: rows closed and distinct staff affected. */
export function leaveCutoffOutcome<
  T extends { status: string; toDate: string | Date; employeeId: string },
>(
  leaves: T[],
  todayISO: string,
): { autoLwp: number; employees: number; leaveIds: string[]; employeeIds: string[] } {
  const due = overdueLeaves(leaves, todayISO);
  const employeeIds = [...new Set(due.map((l) => l.employeeId))];
  return {
    autoLwp: due.length,
    employees: employeeIds.length,
    leaveIds: due.map((l: any) => l.id),
    employeeIds,
  };
}

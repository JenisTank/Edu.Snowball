/**
 * Attendance timing rules — pure functions, no database access.
 *
 * System rule 5 (dynamic timing): every threshold derives from the batch
 * master's class start time. Nothing is hardcoded to a wall-clock hour.
 */

/** India Standard Time offset — the ERP always runs on school-local time. */
export const IST = '+05:30';

export const LOCK_AFTER_MINUTES = 30;
export const ABSENCE_ALERT_AFTER_MINUTES = 30; // after the lock
export const ADMIN_CALL_AFTER_MINUTES = 120; // after the lock

export interface AttendanceTimings {
  /** Class start for the given date. */
  start: Date;
  /** Register locks here — teacher edits now need a Centre Head override. */
  lockAt: Date;
  /** Absence message to parents is queued at this time. */
  absenceMsgAt: Date;
  /** Unreachable family → admin call task. */
  adminCallAt: Date;
}

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

export function lockTimes(dateISO: string, startTime: string): AttendanceTimings {
  const start = new Date(`${dateISO}T${startTime}:00${IST}`);
  const lockAt = addMinutes(start, LOCK_AFTER_MINUTES);
  return {
    start,
    lockAt,
    absenceMsgAt: addMinutes(lockAt, ABSENCE_ALERT_AFTER_MINUTES),
    adminCallAt: addMinutes(lockAt, ADMIN_CALL_AFTER_MINUTES),
  };
}

/** True once the register is locked for editing (Centre Head override required). */
export function isLocked(lockAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > lockAt.getTime();
}

/** Three consecutive absences escalate to the Centre Head. */
export const CONSECUTIVE_ABSENCE_ESCALATION = 3;

/* ───────────────────────── Reports ───────────────────────── */

/** Longest range a single report request may cover (a school year). */
export const MAX_REPORT_DAYS = 366;

export interface AttendanceSummaryRow {
  studentId: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE' | string;
}

export interface StudentAttendanceSummary {
  studentId: string;
  present: number;
  absent: number;
  leave: number;
  marked: number;
  /** Present ÷ marked, 0 when nothing was marked (never divide by zero). */
  percent: number;
}

/**
 * Per-student totals for a date range.
 *
 * `percent` is attendance rate — present over *marked* days, not over calendar
 * days — so a holiday or an unmarked register never looks like an absence.
 */
export function summariseAttendance(rows: AttendanceSummaryRow[]): StudentAttendanceSummary[] {
  const agg = new Map<string, StudentAttendanceSummary>();
  for (const r of rows) {
    const a = agg.get(r.studentId) ?? {
      studentId: r.studentId,
      present: 0,
      absent: 0,
      leave: 0,
      marked: 0,
      percent: 0,
    };
    if (r.status === 'PRESENT') a.present += 1;
    else if (r.status === 'LEAVE') a.leave += 1;
    else a.absent += 1;
    a.marked += 1;
    agg.set(r.studentId, a);
  }
  return [...agg.values()]
    .map((a) => ({ ...a, percent: a.marked ? Math.round((a.present / a.marked) * 100) : 0 }))
    .sort((x, y) => x.percent - y.percent || x.studentId.localeCompare(y.studentId));
}

/** Whole-centre roll-up of the same rows (used for the batch header). */
export function summariseTotals(rows: AttendanceSummaryRow[]) {
  const sums = summariseAttendance(rows);
  const present = sums.reduce((n, s) => n + s.present, 0);
  const absent = sums.reduce((n, s) => n + s.absent, 0);
  const leave = sums.reduce((n, s) => n + s.leave, 0);
  const marked = present + absent + leave;
  return {
    students: sums.length,
    present,
    absent,
    leave,
    marked,
    percent: marked ? Math.round((present / marked) * 100) : 0,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-13-01, 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate a report range. Returns a range or an error.
 * Defaults to the last 30 days, so a request with no query still answers.
 */
export function reportRange(
  from?: string,
  to?: string,
  todayISO: string = new Date().toISOString().slice(0, 10),
): { from: string; to: string } | { error: string } {
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to)))
    return { error: 'Dates must be YYYY-MM-DD' };
  const end = to ?? todayISO;
  const start =
    from ??
    new Date(new Date(`${end}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  if (start > end) return { error: 'The range cannot end before it starts' };
  const days = Math.floor(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days + 1 > MAX_REPORT_DAYS)
    return { error: `A report may cover at most ${MAX_REPORT_DAYS} days` };
  return { from: start, to: end };
}

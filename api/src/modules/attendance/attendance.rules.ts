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

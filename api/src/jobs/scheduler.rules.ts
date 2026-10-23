import { lockTimes } from '../modules/attendance/attendance.rules';

/**
 * Daily attendance planning — pure functions.
 *
 * The safety net must not depend on a teacher remembering to open the register.
 * Every morning at 05:00 IST the scheduler derives, per active batch, the
 * times at which the absence chain fires. If nobody marks, the chain still runs
 * and a "register not submitted" alert lands on the Centre Head's desk.
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** The daily plan is derived at 05:00 IST, before any batch starts. */
export const DAILY_SCAN_HOUR_IST = 5;
/** How long after the lock a missing register is escalated to the Centre Head. */
export const MISSING_REGISTER_AFTER_MINUTES = 30;

export interface BatchLike {
  id: string;
  name?: string | null;
  unitId: string;
  startTime: string;
  isActive?: boolean;
  academicYear?: string | null;
}

export interface HolidayLike {
  unitId: string | null;
  date: Date | string;
}

export interface BatchPlan {
  batchId: string;
  unitId: string;
  name: string | null;
  dateISO: string;
  lockAt: string;
  absenceMsgAt: string;
  adminCallAt: string;
  /** Register not submitted → Centre Head alert. */
  teacherAlertAt: string;
  /** True when the whole chain is already in the past (backfill, late start). */
  past: boolean;
  skip: boolean;
  reason?: string;
}

/** ISO date (YYYY-MM-DD) for a Date, in India Standard Time. */
export function istDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0–23 hour of the day in IST. */
export function istHour(d: Date = new Date()): number {
  return new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();
}

const isoOf = (v: Date | string) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

/** A unit-level or global holiday closes the centre for that date. */
export function isHoliday(dateISO: string, unitId: string, holidays: HolidayLike[]): boolean {
  return holidays.some(
    (h) => isoOf(h.date) === dateISO && (h.unitId === null || h.unitId === unitId),
  );
}

/**
 * Build the day's plan.
 *
 * `now` is injected so the result is deterministic in tests. A batch that has
 * already passed its alert window is still planned (skip=false) — enqueuing a
 * delayed job with a zero delay is what makes a mid-day deploy recover an
 * unmarked morning rather than silently losing it.
 */
export function dailyScanPlan(
  dateISO: string,
  batches: BatchLike[],
  holidays: HolidayLike[] = [],
  now: Date = new Date(),
): BatchPlan[] {
  const plans: BatchPlan[] = [];
  for (const b of batches) {
    if (b.isActive === false) continue;
    if (!b.startTime || !/^\d{2}:\d{2}$/.test(b.startTime)) continue;
    if (isHoliday(dateISO, b.unitId, holidays)) {
      plans.push({
        batchId: b.id,
        unitId: b.unitId,
        name: b.name ?? null,
        dateISO,
        lockAt: '',
        absenceMsgAt: '',
        adminCallAt: '',
        teacherAlertAt: '',
        past: true,
        skip: true,
        reason: 'HOLIDAY',
      });
      continue;
    }
    const { lockAt, absenceMsgAt, adminCallAt } = lockTimes(dateISO, b.startTime);
    const teacherAlertAt = new Date(
      absenceMsgAt.getTime() + MISSING_REGISTER_AFTER_MINUTES * 60_000,
    );
    plans.push({
      batchId: b.id,
      unitId: b.unitId,
      name: b.name ?? null,
      dateISO,
      lockAt: lockAt.toISOString(),
      absenceMsgAt: absenceMsgAt.toISOString(),
      adminCallAt: adminCallAt.toISOString(),
      teacherAlertAt: teacherAlertAt.toISOString(),
      past: absenceMsgAt.getTime() < now.getTime(),
      skip: false,
    });
  }
  return plans;
}

/**
 * Has today's plan been derived yet? Runs once per IST day, after 05:00.
 * `lastRunISO` is the date key stored in app_settings.
 */
export function shouldRunDailyScan(
  now: Date,
  lastRunISO: string | null,
  hour: number = DAILY_SCAN_HOUR_IST,
): boolean {
  const today = istDateKey(now);
  if (lastRunISO === today) return false;
  return istHour(now) >= hour;
}

/** Delay in ms until a target ISO timestamp, never negative. */
export function delayUntil(targetISO: string, now: Date = new Date()): number {
  const t = new Date(targetISO).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, t - now.getTime());
}

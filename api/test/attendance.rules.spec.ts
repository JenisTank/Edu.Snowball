import {
  CONSECUTIVE_ABSENCE_ESCALATION,
  IST,
  isLocked,
  lockTimes,
} from '../src/modules/attendance/attendance.rules';

describe('attendance timing (system rule 5 — dynamic per batch)', () => {
  it('locks the register exactly 30 minutes after class start', () => {
    const t = lockTimes('2026-10-21', '08:00');
    expect(t.lockAt.getTime() - t.start.getTime()).toBe(30 * 60_000);
  });

  it('derives every threshold from the batch start, never a fixed hour', () => {
    const morning = lockTimes('2026-10-21', '08:00');
    const afternoon = lockTimes('2026-10-21', '13:45');
    // different batches, same rules
    expect(afternoon.lockAt.getTime() - afternoon.start.getTime()).toBe(30 * 60_000);
    expect(morning.lockAt.getUTCHours()).not.toBe(afternoon.lockAt.getUTCHours());
  });

  it('uses India Standard Time (UTC+5:30) for class times', () => {
    expect(IST).toBe('+05:30');
    const { start } = lockTimes('2026-10-21', '08:00');
    expect(start.toISOString()).toBe('2026-10-21T02:30:00.000Z');
  });

  it('queues the absence alert 30 min after the lock and the call task 2 h after', () => {
    const t = lockTimes('2026-10-21', '09:00');
    expect(t.absenceMsgAt.getTime() - t.lockAt.getTime()).toBe(30 * 60_000);
    expect(t.adminCallAt.getTime() - t.lockAt.getTime()).toBe(120 * 60_000);
  });

  it('reports locked only strictly after the lock time', () => {
    const t = lockTimes('2026-10-21', '09:00');
    expect(isLocked(t.lockAt, new Date(t.lockAt.getTime() - 1))).toBe(false);
    expect(isLocked(t.lockAt, new Date(t.lockAt.getTime() + 1))).toBe(true);
  });

  it('escalates after three consecutive absences', () => {
    expect(CONSECUTIVE_ABSENCE_ESCALATION).toBe(3);
  });
});

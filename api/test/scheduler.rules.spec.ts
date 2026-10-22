import {
  DAILY_SCAN_HOUR_IST,
  dailyScanPlan,
  delayUntil,
  isHoliday,
  istDateKey,
  istHour,
  shouldRunDailyScan,
} from '../src/jobs/scheduler.rules';

describe('daily attendance scheduler', () => {
  const batches = [
    { id: 'b1', name: 'K1 Morning', unitId: 'u1', startTime: '08:00', isActive: true },
    { id: 'b2', name: 'PlayHouse', unitId: 'u1', startTime: '09:30', isActive: true },
    { id: 'b3', name: 'Old batch', unitId: 'u1', startTime: '10:00', isActive: false },
    { id: 'b4', name: 'Broken', unitId: 'u2', startTime: 'noon', isActive: true },
  ];

  describe('clock helpers', () => {
    it('reads the IST date and hour', () => {
      expect(istDateKey(new Date('2026-10-21T20:00:00Z'))).toBe('2026-10-22'); // 01:30 IST
      expect(istHour(new Date('2026-10-22T00:00:00Z'))).toBe(5); // 05:30 IST
    });

    it('runs once per IST day, only after 05:00', () => {
      const beforeDawn = new Date('2026-10-21T22:30:00Z'); // 04:00 IST on the 22nd
      const afterDawn = new Date('2026-10-22T00:00:00Z'); // 05:30 IST on the 22nd
      expect(shouldRunDailyScan(beforeDawn, null)).toBe(false);
      expect(shouldRunDailyScan(afterDawn, null)).toBe(true);
      expect(shouldRunDailyScan(afterDawn, '2026-10-22')).toBe(false);
      expect(shouldRunDailyScan(afterDawn, '2026-10-21')).toBe(true);
      expect(DAILY_SCAN_HOUR_IST).toBe(5);
    });
  });

  describe('dailyScanPlan', () => {
    it('plans only active batches with a real start time', () => {
      const plans = dailyScanPlan('2026-10-22', batches, [], new Date('2026-10-22T00:00:00Z'));
      expect(plans.filter((p) => !p.skip).map((p) => p.batchId)).toEqual(['b1', 'b2']);
    });

    it('derives every threshold from the batch start time', () => {
      const plans = dailyScanPlan('2026-10-22', batches, [], new Date('2026-10-22T00:00:00Z'));
      const b1 = plans.find((p) => p.batchId === 'b1')!;
      // 08:00 IST = 02:30Z; lock +30 = 03:00Z; absence msg +30 = 03:30Z
      expect(b1.lockAt).toBe('2026-10-22T03:00:00.000Z');
      expect(b1.absenceMsgAt).toBe('2026-10-22T03:30:00.000Z');
      expect(b1.adminCallAt).toBe('2026-10-22T05:00:00.000Z');
      expect(new Date(b1.teacherAlertAt).getTime()).toBe(
        new Date(b1.absenceMsgAt).getTime() + 30 * 60_000,
      );
    });

    it('skips a holiday, including a global one', () => {
      const holidays = [{ unitId: null, date: new Date('2026-10-22T00:00:00Z') }];
      expect(isHoliday('2026-10-22', 'u1', holidays)).toBe(true);
      const plans = dailyScanPlan('2026-10-22', batches, holidays);
      expect(plans.filter((p) => !p.skip)).toHaveLength(0);
      expect(plans.find((p) => p.batchId === 'b1')!.reason).toBe('HOLIDAY');
    });

    it('scopes a unit holiday to that unit only', () => {
      const holidays = [{ unitId: 'u2', date: '2026-10-22' }];
      expect(isHoliday('2026-10-22', 'u1', holidays)).toBe(false);
      expect(isHoliday('2026-10-22', 'u2', holidays)).toBe(true);
    });

    it('marks an already-late window as past but still plans it', () => {
      // 06:00 UTC = 11:30 IST — every morning batch has locked.
      const plans = dailyScanPlan('2026-10-22', batches, [], new Date('2026-10-22T06:00:00Z'));
      const b1 = plans.find((p) => p.batchId === 'b1')!;
      expect(b1.past).toBe(true);
      expect(b1.skip).toBe(false); // a late deploy still recovers the morning
    });

    it('never returns a negative delay', () => {
      expect(delayUntil('2026-10-22T03:00:00.000Z', new Date('2026-10-22T06:00:00Z'))).toBe(0);
      expect(delayUntil('2026-10-22T03:00:00.000Z', new Date('2026-10-22T02:00:00Z'))).toBe(
        3_600_000,
      );
    });
  });
});

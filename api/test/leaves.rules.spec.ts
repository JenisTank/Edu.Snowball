import {
  canCancel,
  canDecide,
  coversDate,
  datesInclusive,
  daysInclusive,
  istDateKey,
  rangesOverlap,
  suppressingLeave,
  validateLeave,
} from '../src/modules/leaves/leaves.rules';

describe('student leave rules', () => {
  const today = '2026-10-22';

  describe('validateLeave', () => {
    it('accepts a normal range', () => {
      expect(
        validateLeave({
          fromDate: '2026-10-23',
          toDate: '2026-10-25',
          reason: 'Fever',
          todayISO: today,
        }),
      ).toBeNull();
    });

    it('rejects a reversed range', () => {
      expect(
        validateLeave({
          fromDate: '2026-10-25',
          toDate: '2026-10-23',
          reason: 'Fever',
          todayISO: today,
        }),
      ).toMatch(/cannot end before/);
    });

    it('rejects malformed dates', () => {
      expect(
        validateLeave({
          fromDate: '23-10-2026',
          toDate: '2026-10-25',
          reason: 'x',
          todayISO: today,
        }),
      ).toMatch(/YYYY-MM-DD/);
    });

    it('caps a single request at 30 days', () => {
      expect(
        validateLeave({
          fromDate: '2026-11-01',
          toDate: '2026-12-15',
          reason: 'Travel',
          todayISO: today,
        }),
      ).toMatch(/30 days/);
    });

    it('allows a leave that started yesterday (late reporting)', () => {
      expect(
        validateLeave({
          fromDate: '2026-10-21',
          toDate: '2026-10-22',
          reason: 'Viral',
          todayISO: today,
        }),
      ).toBeNull();
    });

    it('requires a meaningful reason', () => {
      expect(
        validateLeave({ fromDate: today, toDate: today, reason: '  ', todayISO: today }),
      ).toMatch(/reason is required/);
      expect(
        validateLeave({ fromDate: today, toDate: today, reason: 'ok', todayISO: today }),
      ).toMatch(/more detail/);
    });
  });

  describe('date maths', () => {
    it('counts inclusively', () => {
      expect(daysInclusive('2026-10-22', '2026-10-22')).toBe(1);
      expect(daysInclusive('2026-10-01', '2026-10-31')).toBe(31);
    });

    it('expands a range', () => {
      expect(datesInclusive('2026-10-30', '2026-11-02')).toEqual([
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
      ]);
    });

    it('detects covering dates and overlap', () => {
      const leave = { fromDate: '2026-10-20', toDate: '2026-10-24' };
      expect(coversDate(leave, '2026-10-22')).toBe(true);
      expect(coversDate(leave, '2026-10-25')).toBe(false);
      expect(rangesOverlap(leave, { fromDate: '2026-10-24', toDate: '2026-10-28' })).toBe(true);
      expect(rangesOverlap(leave, { fromDate: '2026-10-25', toDate: '2026-10-28' })).toBe(false);
    });

    it('derives the IST date key, not UTC', () => {
      // 22:00 UTC on the 21st is 03:30 IST on the 22nd.
      expect(istDateKey(new Date('2026-10-21T22:00:00Z'))).toBe('2026-10-22');
      expect(istDateKey(new Date('2026-10-21T18:00:00Z'))).toBe('2026-10-21');
    });
  });

  describe('suppression', () => {
    const base = { fromDate: '2026-10-20', toDate: '2026-10-24' };

    it('only APPROVED leave suppresses the absence chain', () => {
      expect(suppressingLeave([{ ...base, status: 'PENDING' }], '2026-10-22')).toBeNull();
      expect(suppressingLeave([{ ...base, status: 'REJECTED' }], '2026-10-22')).toBeNull();
      expect(suppressingLeave([{ ...base, status: 'APPROVED' }], '2026-10-22')).not.toBeNull();
    });

    it('does not suppress a date outside the range', () => {
      expect(suppressingLeave([{ ...base, status: 'APPROVED' }], '2026-10-25')).toBeNull();
    });

    it('treats database timestamps and ISO strings alike', () => {
      const row = {
        fromDate: '2026-10-20T00:00:00.000Z',
        toDate: '2026-10-24T00:00:00.000Z',
        status: 'APPROVED',
      };
      expect(suppressingLeave([row], '2026-10-22')).not.toBeNull();
    });
  });

  describe('state machine', () => {
    it('decides only pending applications', () => {
      expect(canDecide('PENDING')).toBe(true);
      expect(canDecide('APPROVED')).toBe(false);
      expect(canDecide('REJECTED')).toBe(false);
    });

    it('cancels only before the leave starts', () => {
      expect(canCancel('APPROVED', '2026-10-23', '2026-10-22')).toBe(true);
      expect(canCancel('APPROVED', '2026-10-22', '2026-10-22')).toBe(false);
      expect(canCancel('CANCELLED', '2026-10-23', '2026-10-22')).toBe(false);
    });
  });
});

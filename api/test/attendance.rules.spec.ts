import {
  CONSECUTIVE_ABSENCE_ESCALATION,
  IST,
  isLocked,
  lockTimes,
  MAX_REPORT_DAYS,
  reportRange,
  summariseAttendance,
  summariseTotals,
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

describe('attendance reports', () => {
  const rows = [
    { studentId: 'a', status: 'PRESENT' },
    { studentId: 'a', status: 'PRESENT' },
    { studentId: 'a', status: 'ABSENT' },
    { studentId: 'b', status: 'PRESENT' },
    { studentId: 'b', status: 'LEAVE' },
    { studentId: 'b', status: 'ABSENT' },
    { studentId: 'b', status: 'ABSENT' },
  ];

  it('counts present/absent/leave and rates over marked days only', () => {
    const [b, a] = summariseAttendance(rows);
    expect(a).toMatchObject({
      studentId: 'a',
      present: 2,
      absent: 1,
      leave: 0,
      marked: 3,
      percent: 67,
    });
    expect(b).toMatchObject({
      studentId: 'b',
      present: 1,
      absent: 2,
      leave: 1,
      marked: 4,
      percent: 25,
    });
  });

  it('sorts the weakest first so the report surfaces the child who needs a call', () => {
    expect(summariseAttendance(rows).map((r) => r.studentId)).toEqual(['b', 'a']);
  });

  it('never divides by zero when a register was never opened', () => {
    expect(summariseAttendance([])).toEqual([]);
    expect(summariseTotals([])).toEqual({
      students: 0,
      present: 0,
      absent: 0,
      leave: 0,
      marked: 0,
      percent: 0,
    });
  });

  it('rolls up totals across students', () => {
    expect(summariseTotals(rows)).toMatchObject({
      students: 2,
      present: 3,
      absent: 3,
      leave: 1,
      marked: 7,
      percent: 43,
    });
  });

  it('defaults to the last 30 days when no range is given', () => {
    const r = reportRange(undefined, undefined, '2026-10-31');
    expect(r).toEqual({ from: '2026-10-02', to: '2026-10-31' });
  });

  it('rejects malformed, inverted and oversized ranges', () => {
    expect(reportRange('2026-13-01', '2026-10-31')).toEqual({ error: 'Dates must be YYYY-MM-DD' });
    expect(reportRange('2026-10-31', '2026-10-01')).toEqual({
      error: 'The range cannot end before it starts',
    });
    expect(reportRange('2020-01-01', '2026-10-31')).toEqual({
      error: `A report may cover at most ${MAX_REPORT_DAYS} days`,
    });
  });
});

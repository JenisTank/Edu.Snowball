import {
  isPayslipVisible,
  leaveDays,
  monthBounds,
  overlaps,
  validateLeaveWindow,
} from '../src/modules/hr/me.rules';

describe('employee self-service rules', () => {
  it('counts leave days inclusively like the paper form', () => {
    expect(leaveDays('2026-11-02', '2026-11-02')).toBe(1);
    expect(leaveDays('2026-11-02', '2026-11-06')).toBe(5);
    expect(leaveDays('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('accepts a sane window and rejects nonsense', () => {
    const today = '2026-11-01';
    expect(validateLeaveWindow('2026-11-03', '2026-11-04', today)).toEqual({ ok: true, days: 2 });
    expect(validateLeaveWindow('2026-11-04', '2026-11-03', today).error).toMatch(/end date/);
    expect(validateLeaveWindow('2026-11-01', '2027-02-01', today).error).toMatch(/60 days/);
    expect(validateLeaveWindow('2026-08-01', '2026-08-03', today).error).toMatch(/30 days/);
    expect(validateLeaveWindow('', '', today).ok).toBe(false);
  });

  it('detects overlapping applications but ignores rejected ones', () => {
    const existing = [{ fromDate: '2026-11-05', toDate: '2026-11-07', status: 'PENDING_MANAGER' }];
    expect(overlaps('2026-11-07', '2026-11-09', existing)).toBe(true);
    expect(overlaps('2026-11-08', '2026-11-09', existing)).toBe(false);
    expect(overlaps('2026-11-05', '2026-11-07', [{ ...existing[0], status: 'REJECTED' }])).toBe(
      false,
    );
  });

  it('bounds a month correctly, including February and December', () => {
    const feb = monthBounds('2026-02');
    expect(feb.start.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(feb.end.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(monthBounds('2026-12').end.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(monthBounds('2026-13').valid).toBe(false);
    expect(monthBounds('November').valid).toBe(false);
  });

  it('hides drafts and shows only finalised payslips', () => {
    expect(isPayslipVisible('DRAFT')).toBe(false);
    expect(isPayslipVisible('PENDING_APPROVAL')).toBe(false);
    expect(isPayslipVisible('APPROVED')).toBe(true);
    expect(isPayslipVisible('PAID')).toBe(true);
  });
});

import { joiningWindow, suggestPlan } from '../src/modules/admissions/admissions.rules';

describe('admission joining window (instalment plan suggestion)', () => {
  it('suggests Plan A for Apr–Jul joiners', () => {
    for (const month of [3, 4, 5, 6]) {
      expect(suggestPlan(new Date(2026, month, 15))).toBe('PLAN_A');
      expect(joiningWindow(new Date(2026, month, 15))).toBe('A');
    }
  });

  it('suggests Plan B for Aug–Nov joiners', () => {
    for (const month of [7, 8, 9, 10]) {
      expect(suggestPlan(new Date(2026, month, 1))).toBe('PLAN_B');
      expect(joiningWindow(new Date(2026, month, 1))).toBe('B');
    }
  });

  it('suggests Plan C for Dec–Mar joiners', () => {
    for (const [y, month] of [
      [2026, 11],
      [2027, 0],
      [2027, 1],
      [2027, 2],
    ] as const) {
      expect(suggestPlan(new Date(y, month, 10))).toBe('PLAN_C');
      expect(joiningWindow(new Date(y, month, 10))).toBe('C');
    }
  });
});

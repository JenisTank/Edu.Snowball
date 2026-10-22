/**
 * Admission rules — pure functions, no database access.
 */
export const ACADEMIC_YEAR = '2026-27';
export const ACADEMIC_YEAR_SHORT = '2627';

export type SuggestedPlan = 'PLAN_A' | 'PLAN_B' | 'PLAN_C';

/**
 * Instalment plan suggested by the joining window (spec):
 *  - Apr–Jul  → Plan A (3 instalments)
 *  - Aug–Nov  → Plan B (2 instalments)
 *  - Dec–Mar  → Plan C (full payment)
 */
export function suggestPlan(date: Date = new Date()): SuggestedPlan {
  const month = date.getMonth() + 1;
  if (month >= 4 && month <= 7) return 'PLAN_A';
  if (month >= 8 && month <= 11) return 'PLAN_B';
  return 'PLAN_C';
}

/** Joining window label used on the registration form. */
export function joiningWindow(date: Date = new Date()): 'A' | 'B' | 'C' {
  return suggestPlan(date).slice(-1) as 'A' | 'B' | 'C';
}

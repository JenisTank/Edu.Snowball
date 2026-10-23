/**
 * Front-desk rules.
 *
 * Two things here are money-adjacent and therefore pure and tested:
 *  - a security deposit is a liability, so the only legal endings are "returned"
 *    (money goes back) and "forfeited" (money becomes income, with a reason);
 *  - a visitor who never checks out is a safeguarding problem, so the desk list
 *    has to say so out loud rather than quietly showing nothing.
 */

export const DEPOSIT_STATUSES = ['HELD', 'RETURNED', 'FORFEITED'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** A closed deposit can not be reopened or closed twice. */
export function canCloseDeposit(status: string): boolean {
  return status === 'HELD';
}

/**
 * What the centre owes back. A forfeit may be partial — the desk keeps the
 * damages and returns the rest — so the returnable amount is explicit.
 */
export function refundable(amount: number, outcome: 'RETURNED' | 'FORFEITED', kept?: number) {
  const held = Math.max(0, Number(amount) || 0);
  if (outcome === 'RETURNED') return rounded(held);
  const forfeited = Math.min(held, Math.max(0, Number(kept ?? held) || 0));
  return rounded(held - forfeited);
}

function rounded(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total held per unit — the number that belongs on a balance sheet. */
export function depositsHeld(rows: { amount: number | string; status: string }[]): {
  held: number;
  count: number;
} {
  const open = rows.filter((r) => r.status === 'HELD');
  return {
    held: rounded(open.reduce((n, r) => n + Number(r.amount ?? 0), 0)),
    count: open.length,
  };
}

/**
 * How long a guest has been inside, in minutes. Used to flag anyone who has
 * been on the premises past closing without checking out.
 */
export function minutesInside(inAt: Date | string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(inAt).getTime()) / 60_000));
}

/** Guests still inside, oldest first — reception's "who is in the building". */
export function stillInside<T extends { inAt: Date | string; outAt?: Date | string | null }>(
  rows: T[],
): T[] {
  return rows
    .filter((r) => !r.outAt)
    .sort((a, b) => new Date(a.inAt).getTime() - new Date(b.inAt).getTime());
}

/** A visit that has run past `limitMinutes` needs a follow-up, not a shrug. */
export function overdueVisits<T extends { inAt: Date | string; outAt?: Date | string | null }>(
  rows: T[],
  now: Date = new Date(),
  limitMinutes = 240,
): T[] {
  return stillInside(rows).filter((r) => minutesInside(r.inAt, now) > limitMinutes);
}

/**
 * Waitlist rules.
 *
 * A full batch used to be a dead end at the front desk. These pure helpers keep
 * the queue honest: positions are contiguous per batch, an offer expires so a
 * seat cannot be parked forever, and offers only ever go to someone waiting.
 */

export interface WaitlistLike {
  id: string;
  position: number;
  status: string;
  offerExpiresAt?: string | Date | null;
}

export const OFFER_WINDOW_HOURS = 48;

/** Next position in a batch queue (1-based, no gaps). */
export function positionFor(entries: WaitlistLike[]): number {
  const active = entries.filter((e) => e.status !== 'DECLINED' && e.status !== 'EXPIRED');
  return active.reduce((max, e) => Math.max(max, e.position), 0) + 1;
}

/** When an offer lapses; the batch then moves to the next family. */
export function offerExpiry(now: Date, hours = OFFER_WINDOW_HOURS): Date {
  return new Date(now.getTime() + hours * 3600_000);
}

export const WAITLIST_TRANSITIONS: Record<string, string[]> = {
  WAITING: ['OFFERED', 'DECLINED', 'EXPIRED'],
  OFFERED: ['CONVERTED', 'DECLINED', 'EXPIRED'],
  CONVERTED: [],
  DECLINED: [],
  EXPIRED: [],
};

export function canTransitionWaitlist(from: string, to: string): boolean {
  return (WAITLIST_TRANSITIONS[from] ?? []).includes(to);
}

/** An OFFERED row whose window has closed counts as expired. */
export function isLapsed(entry: WaitlistLike, now: Date): boolean {
  if (entry.status !== 'OFFERED' || !entry.offerExpiresAt) return false;
  return new Date(entry.offerExpiresAt).getTime() < now.getTime();
}

/**
 * Who to offer when `seats` free up: waiting families in strict position order,
 * skipping anyone already offered a seat.
 */
export function toOffer(seats: number, entries: WaitlistLike[]): string[] {
  if (seats <= 0) return [];
  return entries
    .filter((e) => e.status === 'WAITING')
    .sort((a, b) => a.position - b.position)
    .slice(0, seats)
    .map((e) => e.id);
}

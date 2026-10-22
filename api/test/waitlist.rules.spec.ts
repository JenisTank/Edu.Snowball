import {
  canTransitionWaitlist,
  isLapsed,
  offerExpiry,
  positionFor,
  toOffer,
} from '../src/modules/admissions/waitlist.rules';

const row = (id: string, position: number, status = 'WAITING', offerExpiresAt?: string) => ({
  id,
  position,
  status,
  offerExpiresAt,
});

describe('waitlist', () => {
  it('numbers the queue without gaps and reuses freed positions', () => {
    expect(positionFor([])).toBe(1);
    expect(positionFor([row('a', 1), row('b', 2)])).toBe(3);
    // A declined family must not hold a position forever.
    expect(positionFor([row('a', 1), row('b', 2, 'DECLINED')])).toBe(2);
  });

  it('offers seats strictly in position order, only to waiting families', () => {
    const entries = [row('c', 3), row('a', 1), row('b', 2, 'OFFERED')];
    expect(toOffer(2, entries)).toEqual(['a', 'c']);
    expect(toOffer(0, entries)).toEqual([]);
    expect(toOffer(5, entries)).toEqual(['a', 'c']);
  });

  it('expires an offer so a seat cannot be parked', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const expiry = offerExpiry(now);
    expect(expiry.toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(isLapsed(row('a', 1, 'OFFERED', '2026-11-02T10:00:00Z'), now)).toBe(false);
    expect(isLapsed(row('a', 1, 'OFFERED', '2026-10-31T10:00:00Z'), now)).toBe(true);
    expect(isLapsed(row('a', 1, 'WAITING'), now)).toBe(false);
  });

  it('allows only the status changes the office workflow needs', () => {
    expect(canTransitionWaitlist('WAITING', 'OFFERED')).toBe(true);
    expect(canTransitionWaitlist('OFFERED', 'CONVERTED')).toBe(true);
    expect(canTransitionWaitlist('OFFERED', 'DECLINED')).toBe(true);
    expect(canTransitionWaitlist('WAITING', 'CONVERTED')).toBe(false);
    expect(canTransitionWaitlist('CONVERTED', 'OFFERED')).toBe(false);
    expect(canTransitionWaitlist('DECLINED', 'OFFERED')).toBe(false);
  });
});

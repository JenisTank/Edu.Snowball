import {
  canCloseDeposit,
  depositsHeld,
  minutesInside,
  overdueVisits,
  refundable,
  stillInside,
} from '../src/modules/frontdesk/frontdesk.rules';

describe('security deposits', () => {
  it('returns the full amount when the deposit is returned', () => {
    expect(refundable(5000, 'RETURNED')).toBe(5000);
  });

  it('forfeits the whole deposit when nothing is returned', () => {
    expect(refundable(5000, 'FORFEITED')).toBe(0);
  });

  it('forfeits part of it and returns the rest', () => {
    expect(refundable(5000, 'FORFEITED', 1200)).toBe(3800);
  });

  it('never returns more than was held', () => {
    expect(refundable(5000, 'FORFEITED', 9000)).toBe(0);
    expect(refundable(5000, 'FORFEITED', -100)).toBe(5000);
  });

  it('only closes a deposit that is still held', () => {
    expect(canCloseDeposit('HELD')).toBe(true);
    expect(canCloseDeposit('RETURNED')).toBe(false);
    expect(canCloseDeposit('FORFEITED')).toBe(false);
  });

  it('totals only what is still held', () => {
    const totals = depositsHeld([
      { amount: '5000', status: 'HELD' },
      { amount: 2500, status: 'HELD' },
      { amount: 1000, status: 'RETURNED' },
    ]);
    expect(totals).toEqual({ held: 7500, count: 2 });
  });
});

describe('visitor book', () => {
  const now = new Date('2026-10-23T10:00:00Z');

  it('counts how long somebody has been inside', () => {
    expect(minutesInside('2026-10-23T09:15:00Z', now)).toBe(45);
    expect(minutesInside('2026-10-23T11:00:00Z', now)).toBe(0);
  });

  it('lists only guests who have not checked out, oldest first', () => {
    const rows = [
      { name: 'a', inAt: '2026-10-23T09:00:00Z', outAt: null },
      { name: 'b', inAt: '2026-10-23T08:00:00Z', outAt: null },
      { name: 'c', inAt: '2026-10-23T07:00:00Z', outAt: '2026-10-23T07:30:00Z' },
    ];
    expect(stillInside(rows).map((r) => r.name)).toEqual(['b', 'a']);
  });

  it('flags a visit that has overrun the expected stay', () => {
    const rows = [
      { name: 'short', inAt: '2026-10-23T09:30:00Z' },
      { name: 'long', inAt: '2026-10-23T05:00:00Z' },
    ];
    expect(overdueVisits(rows, now, 240).map((r) => r.name)).toEqual(['long']);
  });
});

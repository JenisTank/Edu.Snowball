import {
  canChangeStatus,
  canEdit,
  canLock,
  canUnlock,
  dailyPlan,
  isActiveOn,
  isHiddenFromDaily,
  isLocked,
  nextVersion,
  PLAN_KINDS,
  PLAN_STATUSES,
  resolveOverlay,
  validateOverlay,
  type PlanRecord,
} from '../src/modules/academic/academic.rules';

const plan = (over: Partial<PlanRecord> = {}): PlanRecord => ({
  id: 'p1',
  kind: 'LOG_PLAN',
  title: 'Sensory play',
  status: 'APPROVED',
  unitId: null,
  month: null,
  startDate: null,
  endDate: null,
  payload: {},
  ...over,
});

describe('academic planning', () => {
  describe('daily plan (derived view)', () => {
    it('includes a calendar entry only inside its date range', () => {
      const p = plan({
        id: 'c1',
        kind: 'CALENDAR',
        title: 'Grandparents day',
        startDate: '2026-10-20',
        endDate: '2026-10-24',
      });
      expect(isActiveOn(p, '2026-10-19')).toBe(false);
      expect(isActiveOn(p, '2026-10-22')).toBe(true);
      expect(isActiveOn(p, '2026-10-25')).toBe(false);
    });

    it('includes a log-plan entry by month, or by day-of-month when given', () => {
      expect(isActiveOn(plan({ month: 10 }), '2026-10-22')).toBe(true);
      expect(isActiveOn(plan({ month: 11 }), '2026-10-22')).toBe(false);
      expect(isActiveOn(plan({ month: 10, payload: { dayOfMonth: 22 } }), '2026-10-22')).toBe(true);
      expect(isActiveOn(plan({ month: 10, payload: { dayOfMonth: 5 } }), '2026-10-22')).toBe(false);
    });

    it('never derives anything from an invalid date', () => {
      expect(isActiveOn(plan({ month: 10 }), '2026-10-32')).toBe(false);
      expect(isActiveOn(plan({ month: 10 }), '22-10-2026')).toBe(false);
    });

    it('hides drafts and published-but-unapproved records', () => {
      expect(isHiddenFromDaily(plan({ status: 'DRAFT' }))).toBe(true);
      expect(isHiddenFromDaily(plan({ status: 'SUBMITTED' }))).toBe(true);
      expect(isHiddenFromDaily(plan({ status: 'APPROVED' }))).toBe(false);
      expect(isHiddenFromDaily(plan({ status: 'LOCKED' }))).toBe(false);
    });

    it('puts dated commitments before monthly themes, then by time', () => {
      const items = dailyPlan(
        [
          plan({ id: 'l1', title: 'Story circle', month: 10, payload: { time: '10:00' } }),
          plan({
            id: 'c1',
            kind: 'CALENDAR',
            title: 'Sports day',
            startDate: '2026-10-22',
            endDate: '2026-10-22',
            status: 'LOCKED',
          }),
          plan({ id: 'l2', title: 'Art', month: 10, payload: { time: '09:00' } }),
        ],
        '2026-10-22',
      );
      expect(items.map((i) => i.title)).toEqual(['Sports day', 'Art', 'Story circle']);
      expect(items[0]).toMatchObject({ source: 'CALENDAR', kind: 'CALENDAR' });
      expect(items[1]).toMatchObject({ source: 'LOG_PLAN', timeLabel: '09:00' });
    });

    it('scopes a unit to its own records plus the HO masters', () => {
      const items = dailyPlan(
        [
          plan({ id: 'ho', title: 'HO theme', month: 10 }),
          plan({ id: 'u1', title: 'U1 trip', month: 10, unitId: 'u1' }),
          plan({ id: 'u2', title: 'U2 trip', month: 10, unitId: 'u2' }),
        ],
        '2026-10-22',
        { unitId: 'u1' },
      );
      expect(items.map((i) => i.title).sort()).toEqual(['HO theme', 'U1 trip']);
    });

    it('folds a unit overlay into its master instead of listing both', () => {
      const master = plan({ id: 'm1', title: 'HO theme', month: 10, status: 'LOCKED' });
      const overlay = plan({
        id: 'o1',
        title: 'Our theme (Gujarati)',
        month: 10,
        unitId: 'u1',
        masterId: 'm1',
      });
      const items = dailyPlan([master, overlay], '2026-10-22', { unitId: 'u1' });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id: 'm1', title: 'Our theme (Gujarati)' });
    });
  });

  describe('HO lock', () => {
    it('refuses every edit to a locked plan except the Founder', () => {
      const locked = plan({ status: 'LOCKED' });
      expect(canEdit(locked, { role: 'ACADEMIC_DIR' })).toMatchObject({ allowed: false });
      expect(canEdit(locked, { role: 'CENTRE_HEAD', unitId: 'u1' })).toMatchObject({
        allowed: false,
      });
      expect(canEdit(locked, { role: 'FOUNDER' }).allowed).toBe(true);
    });

    it('lets the Academic Director author HO plans and units author overlays', () => {
      expect(canEdit(plan(), { role: 'ACADEMIC_DIR' }).allowed).toBe(true);
      expect(canEdit(plan(), { role: 'CENTRE_HEAD', unitId: 'u1' }).allowed).toBe(false);
      expect(
        canEdit(plan({ unitId: 'u1', masterId: 'm1' }), { role: 'CENTRE_HEAD', unitId: 'u1' })
          .allowed,
      ).toBe(true);
      expect(
        canEdit(plan({ unitId: 'u2', masterId: 'm1' }), { role: 'CENTRE_HEAD', unitId: 'u1' })
          .allowed,
      ).toBe(false);
    });

    it('only Head Office locks, and only the Founder unlocks', () => {
      expect(canLock(plan(), { role: 'ACADEMIC_DIR' })).toBe(true);
      expect(canLock(plan({ status: 'LOCKED' }), { role: 'ACADEMIC_DIR' })).toBe(false);
      expect(canLock(plan(), { role: 'CENTRE_HEAD' })).toBe(false);
      expect(canUnlock({ role: 'FOUNDER' })).toBe(true);
      expect(canUnlock({ role: 'ACADEMIC_DIR' })).toBe(false);
      expect(isLocked({ status: 'LOCKED' })).toBe(true);
    });

    it('bumps the version on every edit', () => {
      expect(nextVersion(undefined)).toBe(2);
      expect(nextVersion(1)).toBe(2);
      expect(nextVersion(7)).toBe(8);
    });

    it('allows only sensible status moves and nothing out of LOCKED', () => {
      expect(canChangeStatus('DRAFT', 'SUBMITTED').ok).toBe(true);
      expect(canChangeStatus('SUBMITTED', 'APPROVED').ok).toBe(true);
      expect(canChangeStatus('APPROVED', 'LOCKED').ok).toBe(true);
      expect(canChangeStatus('LOCKED', 'APPROVED')).toMatchObject({ ok: false });
      expect(canChangeStatus('DRAFT', 'NONSENSE')).toMatchObject({ ok: false });
      expect(PLAN_KINDS).toHaveLength(4);
      expect(PLAN_STATUSES).toContain('LOCKED');
    });
  });

  describe('unit overlay', () => {
    const master = plan({ id: 'm1', status: 'LOCKED', unitId: null });

    it('accepts an overlay of a locked HO master', () => {
      expect(
        validateOverlay(
          master,
          { unitId: 'u1', kind: 'LOG_PLAN' },
          {
            role: 'CENTRE_HEAD',
            unitId: 'u1',
          },
        ),
      ).toEqual({ ok: true });
    });

    it('refuses an unlocked master, a unit master, or an overlay of an overlay', () => {
      expect(
        validateOverlay(
          plan({ id: 'm2', status: 'APPROVED' }),
          { unitId: 'u1' },
          {
            role: 'CENTRE_HEAD',
            unitId: 'u1',
          },
        ),
      ).toMatchObject({ ok: false, error: 'The master must be locked before a unit can adapt it' });

      expect(
        validateOverlay(
          plan({ id: 'm3', status: 'LOCKED', unitId: 'u2' }),
          { unitId: 'u1' },
          {
            role: 'FOUNDER',
          },
        ),
      ).toMatchObject({ ok: false });

      expect(
        validateOverlay(
          plan({ id: 'm4', status: 'LOCKED', masterId: 'm1' }),
          { unitId: 'u1' },
          {
            role: 'FOUNDER',
          },
        ),
      ).toMatchObject({ ok: false, error: 'An overlay cannot itself be overlaid' });
    });

    it('stops a unit from adapting another unit’s plan', () => {
      expect(
        validateOverlay(master, { unitId: 'u2' }, { role: 'CENTRE_HEAD', unitId: 'u1' }),
      ).toMatchObject({ ok: false });
    });

    it('keeps the master kind', () => {
      expect(
        validateOverlay(master, { unitId: 'u1', kind: 'CALENDAR' }, { role: 'FOUNDER' }),
      ).toMatchObject({ ok: false, error: 'The overlay must keep the master’s kind' });
    });

    it('resolves effective fields with the overlay winning', () => {
      const overlay = plan({ id: 'o1', title: 'Local title', masterId: 'm1', unitId: 'u1' });
      expect(resolveOverlay(master, overlay)).toMatchObject({
        id: 'm1',
        title: 'Local title',
        overlaid: true,
      });
      expect(resolveOverlay(master, null)).toMatchObject({ title: master.title, overlaid: false });
    });
  });
});

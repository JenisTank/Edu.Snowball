/**
 * Academic planning rules — pure functions, no database access.
 *
 * Three things the spec asks for that the module did not have:
 *
 *  1. **Daily Plan as a derived view** — the day's activities are computed from
 *     the Calendar (date ranges) and the Log Plan (monthly items), never stored
 *     twice. One source of truth, so a teacher's day view cannot disagree with
 *     the plan the Academic Director approved.
 *  2. **Unit overlay on the AD master Log Plan** — an HO record is the master;
 *     a unit may adapt it (local timing, local resources) without forking the
 *     master. The overlay wins on the fields it sets and inherits the rest.
 *  3. **HO-locked authoring** — once the Academic Director locks a record, units
 *     consume it read-only. Only the Founder can unlock, and every edit bumps
 *     the version so the change trail is visible.
 */

export const PLAN_KINDS = ['YEARLY_GOAL', 'BIG_ROCK', 'CALENDAR', 'LOG_PLAN'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Roles that author at Head Office. */
export const AUTHOR_ROLES = ['FOUNDER', 'ACADEMIC_DIR'] as const;
/** Roles that consume a locked master and may add a unit overlay. */
export const CONSUMER_ROLES = ['CENTRE_HEAD', 'COORDINATOR', 'CURRICULUM_LEAD', 'TEACHER'] as const;

export interface PlanRecord {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  unitId?: string | null;
  programmeId?: string | null;
  month?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  status: string;
  parentVisible?: boolean;
  payload?: Record<string, any> | null;
  masterId?: string | null;
  version?: number;
}

const isoOf = (d: string | Date): string =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

const validIso = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// ───────────────────────── lock / version ─────────────────────────

/** A locked record is read-only for everyone except the Founder. */
export function isLocked(plan: { status?: string | null }): boolean {
  return plan.status === 'LOCKED';
}

export interface EditPermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Who may edit this record.
 *
 *  - a locked record: only the Founder (and only to unlock it first),
 *  - an HO master (no unit): Founder / Academic Director,
 *  - a unit overlay: that unit's Centre Head or Coordinator, or HO.
 */
export function canEdit(
  plan: PlanRecord,
  user: { role: string; unitId?: string | null },
): EditPermission {
  if (isLocked(plan)) {
    return user.role === 'FOUNDER'
      ? { allowed: true }
      : {
          allowed: false,
          reason: 'This plan is locked by Head Office. Ask the Founder to unlock it.',
        };
  }
  const hoUser = ['FOUNDER', 'ACADEMIC_DIR'].includes(user.role);
  if (!plan.unitId) {
    return hoUser
      ? { allowed: true }
      : { allowed: false, reason: 'Head Office plans are authored by the Academic Director.' };
  }
  if (hoUser) return { allowed: true };
  if (!['CENTRE_HEAD', 'COORDINATOR'].includes(user.role)) {
    return {
      allowed: false,
      reason: 'Only the Centre Head or Coordinator may edit a unit overlay.',
    };
  }
  if (plan.unitId !== user.unitId) {
    return { allowed: false, reason: 'This plan belongs to another unit.' };
  }
  return { allowed: true };
}

/** Only the Founder unlocks; locking needs the authoring role. */
export function canUnlock(user: { role: string }): boolean {
  return user.role === 'FOUNDER';
}

export function canLock(plan: PlanRecord, user: { role: string }): boolean {
  if (!['FOUNDER', 'ACADEMIC_DIR'].includes(user.role)) return false;
  return !isLocked(plan);
}

/** Version bumps on every accepted edit; a new record starts at 1. */
export function nextVersion(current?: number | null): number {
  return Math.max(1, Number(current) || 1) + 1;
}

export interface StatusChange {
  ok: boolean;
  error?: string;
}

const TRANSITIONS: Record<string, PlanStatus[]> = {
  DRAFT: ['SUBMITTED', 'APPROVED', 'LOCKED'],
  SUBMITTED: ['APPROVED', 'DRAFT', 'LOCKED'],
  APPROVED: ['LOCKED', 'DRAFT'],
  LOCKED: [],
};

/** Status moves are one-way-ish: nothing leaves LOCKED except by unlock. */
export function canChangeStatus(from: string, to: string): StatusChange {
  if (!(PLAN_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: `status must be one of ${PLAN_STATUSES.join(', ')}` };
  }
  if (from === to) return { ok: true };
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to as PlanStatus)) {
    return {
      ok: false,
      error:
        from === 'LOCKED'
          ? 'Unlock the plan before changing its status'
          : `${from} → ${to} is not allowed`,
    };
  }
  return { ok: true };
}

// ─────────────────────── daily plan (derived) ───────────────────────

export interface DailyPlanItem {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  source: 'CALENDAR' | 'LOG_PLAN';
  unitId: string | null;
  programmeId: string | null;
  parentVisible: boolean;
  timeLabel: string | null;
}

const monthOf = (iso: string): number => Number(iso.slice(5, 7));

/** Is this record active on `dateISO`? */
export function isActiveOn(plan: PlanRecord, dateISO: string): boolean {
  if (!validIso(dateISO)) return false;
  if (plan.startDate && plan.endDate) {
    const from = isoOf(plan.startDate);
    const to = isoOf(plan.endDate);
    return dateISO >= from && dateISO <= to;
  }
  if (plan.startDate) return isoOf(plan.startDate) === dateISO;
  // A LOG_PLAN entry may pin a day of the month; that is more specific than
  // the month alone, so it must match the day too.
  const day = Number((plan.payload as any)?.dayOfMonth);
  if (Number.isInteger(day) && day > 0) {
    if (typeof plan.month === 'number' && plan.month > 0 && plan.month !== monthOf(dateISO)) {
      return false;
    }
    return day === Number(dateISO.slice(8, 10));
  }
  if (typeof plan.month === 'number' && plan.month > 0) return plan.month === monthOf(dateISO);
  return false;
}

/**
 * The day's plan, derived from Calendar + Log Plan.
 *
 * Rules:
 *  - only records visible to the caller's unit (their own unit or HO-wide),
 *  - locked drafts are excluded, but a locked *approved* plan is included,
 *    because that is exactly the plan a teacher must follow,
 *  - Calendar entries come first (dated commitments beat monthly themes),
 *  - duplicates by id are collapsed, and a unit overlay replaces its master.
 */
export function dailyPlan(
  plans: PlanRecord[],
  dateISO: string,
  opts: { unitId?: string | null } = {},
): DailyPlanItem[] {
  const overlayByMaster = new Map<string, PlanRecord>();
  for (const p of plans) if (p.masterId) overlayByMaster.set(p.masterId, p);

  const seen = new Set<string>();
  const out: DailyPlanItem[] = [];

  for (const plan of plans) {
    if (plan.kind !== 'CALENDAR' && plan.kind !== 'LOG_PLAN') continue;
    if (plan.masterId) continue; // the overlay is folded into its master below
    const overlay = overlayByMaster.get(plan.id);
    const effective: PlanRecord = overlay
      ? { ...plan, ...stripNulls(overlay), id: plan.id, kind: plan.kind }
      : plan;
    if (!isActiveOn(effective, dateISO)) continue;
    if (!isVisibleTo(effective, opts.unitId ?? null)) continue;
    if (isHiddenFromDaily(effective)) continue;
    if (seen.has(effective.id)) continue;
    seen.add(effective.id);
    // Mark the overlay as consumed so the orphan pass below skips it.
    if (overlay) seen.add(overlay.id);
    out.push(toItem(effective));
  }

  // An overlay whose master is not in this slice still belongs to the day.
  for (const plan of plans) {
    if (!plan.masterId) continue;
    if (!isActiveOn(plan, dateISO)) continue;
    if (!isVisibleTo(plan, opts.unitId ?? null)) continue;
    if (isHiddenFromDaily(plan)) continue;
    if (seen.has(plan.id)) continue;
    seen.add(plan.id);
    out.push(toItem(plan));
  }

  return out.sort(
    (a, b) =>
      sourceRank(a) - sourceRank(b) ||
      (a.timeLabel ?? '').localeCompare(b.timeLabel ?? '') ||
      a.title.localeCompare(b.title),
  );
}

const sourceRank = (i: DailyPlanItem): number => (i.source === 'CALENDAR' ? 0 : 1);

const stripNulls = (p: Partial<PlanRecord>): Partial<PlanRecord> =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));

/** A unit sees its own records plus the Head Office masters (unitId null). */
export function isVisibleTo(plan: PlanRecord, unitId: string | null): boolean {
  if (!unitId) return true;
  return !plan.unitId || plan.unitId === unitId;
}

/**
 * DRAFT / SUBMITTED records are still being written; a LOCKED draft is also
 * excluded. APPROVED and LOCKED-approved records are the published plan.
 */
export function isHiddenFromDaily(plan: PlanRecord): boolean {
  if (plan.status === 'DRAFT' || plan.status === 'SUBMITTED') return true;
  return false;
}

function toItem(plan: PlanRecord): DailyPlanItem {
  const payload = (plan.payload ?? {}) as any;
  const timeLabel =
    typeof payload.time === 'string' && payload.time.trim() ? payload.time.trim() : null;
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? null,
    kind: plan.kind,
    source: plan.kind === 'CALENDAR' ? 'CALENDAR' : 'LOG_PLAN',
    unitId: plan.unitId ?? null,
    programmeId: plan.programmeId ?? null,
    parentVisible: !!plan.parentVisible,
    timeLabel,
  };
}

// ─────────────────────────── unit overlay ───────────────────────────

export interface OverlayResult {
  ok: boolean;
  error?: string;
}

/** A unit may only overlay a locked HO master of the same kind. */
export function validateOverlay(
  master: PlanRecord | null,
  input: { unitId?: string | null; kind?: string },
  user: { role: string; unitId?: string | null },
): OverlayResult {
  if (!master) return { ok: false, error: 'Master plan not found' };
  if (master.masterId) return { ok: false, error: 'An overlay cannot itself be overlaid' };
  if (!master.unitId) {
    // HO master: fine.
  } else {
    return { ok: false, error: 'Only a Head Office plan can be overlaid' };
  }
  if (master.status !== 'LOCKED') {
    return { ok: false, error: 'The master must be locked before a unit can adapt it' };
  }
  if (input.kind && input.kind !== master.kind) {
    return { ok: false, error: 'The overlay must keep the master’s kind' };
  }
  const unitId = input.unitId || user.unitId;
  if (!unitId) return { ok: false, error: 'A unit is required to create an overlay' };
  if (!['FOUNDER', 'ACADEMIC_DIR'].includes(user.role) && unitId !== user.unitId) {
    return { ok: false, error: 'You can only adapt plans for your own unit' };
  }
  return { ok: true };
}

/** Effective fields for a master + its overlays (one per unit). */
export function resolveOverlay<T extends PlanRecord>(master: T, overlay?: PlanRecord | null) {
  if (!overlay) return { ...master, overlaid: false as const };
  return {
    ...master,
    ...stripNulls(overlay),
    id: master.id,
    masterId: null,
    overlaid: true as const,
  };
}

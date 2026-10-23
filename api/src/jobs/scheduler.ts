import { Logger } from '@nestjs/common';

import { bbQueue } from './queue';
import {
  AUTO_LWP_STATUS,
  leaveCutoffOutcome,
  PENDING_LEAVE_STATUSES,
} from '../modules/hr/leave.rules';
import {
  dailyScanPlan,
  delayUntil,
  istDateKey,
  shouldRunDailyScan,
  type BatchPlan,
} from './scheduler.rules';

/**
 * Daily attendance scheduler (spec: "05:00 AM job creates the lock jobs").
 *
 * Two layers, deliberately:
 *
 *  1. A BullMQ repeatable job (`daily-attendance-plan`) when Redis is present,
 *     so the plan survives a restart and runs on exactly one replica.
 *  2. An in-process tick that re-derives the plan if the queue was unavailable
 *     or the process started after 05:00. It is idempotent: the date stamp in
 *     app_settings means each IST day is planned once, and every job carries a
 *     deterministic jobId so a duplicate enqueue is a no-op.
 *
 * Net effect: an unmarked register can no longer hide a child from the absence
 * chain — which was the whole point of the default-ABSENT rule.
 */

const LAST_SCAN_KEY = 'scheduler.last_daily_scan';
const LAST_COMMS_KEY = 'scheduler.last_comms_sweep';
const LAST_RETENTION_KEY = 'scheduler.last_retention';
const LAST_LEAVE_CUTOFF_KEY = 'scheduler.last_leave_cutoff';
const LAST_DIGEST_KEY = 'scheduler.last_weekly_digest';
const LAST_REORDER_KEY = 'scheduler.last_reorder_sweep';
const TICK_MS = 60_000;
/** Parent-reply SLA + delivery retries run every 15 minutes. */
const COMMS_SWEEP_MS = 15 * 60_000;
/** DPDP retention runs weekly (Sunday 03:00 IST is inside the daily tick guard). */
const RETENTION_MS = 7 * 24 * 60 * 60_000;
const REPEAT_JOB_ID = 'daily-attendance-plan';

const log = new Logger('AttendanceScheduler');

export interface DailyScanResult {
  dateISO: string;
  planned: number;
  skipped: number;
  enqueued: number;
  queueAvailable: boolean;
  plans: BatchPlan[];
}

/** Derive today's plan and enqueue one absence scan per batch. */
export async function runDailyScan(
  prisma: any,
  opts: { dateISO?: string; force?: boolean; now?: Date } = {},
): Promise<DailyScanResult> {
  const now = opts.now ?? new Date();
  const dateISO = opts.dateISO ?? istDateKey(now);

  const [batches, holidays] = await Promise.all([
    prisma.batch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unitId: true, startTime: true, isActive: true },
    }),
    prisma.hrHoliday.findMany({ select: { unitId: true, date: true } }).catch(() => []),
  ]);

  const plans = dailyScanPlan(dateISO, batches, holidays, now);
  let enqueued = 0;
  let queueAvailable = true;

  for (const p of plans) {
    if (p.skip) continue;
    const delay = delayUntil(p.absenceMsgAt, now);
    try {
      await bbQueue.add(
        'absence-scan',
        { batchId: p.batchId, date: p.dateISO, source: 'daily-plan' },
        { delay, jobId: `absence-${p.batchId}-${p.dateISO}` },
      );
      await bbQueue.add(
        'teacher-not-marked',
        { batchId: p.batchId, date: p.dateISO },
        { delay: delayUntil(p.teacherAlertAt, now), jobId: `unmarked-${p.batchId}-${p.dateISO}` },
      );
      enqueued += 1;
    } catch {
      queueAvailable = false;
      break;
    }
  }

  if (!opts.force && queueAvailable) {
    await prisma.appSetting
      .upsert({
        where: { key: LAST_SCAN_KEY },
        update: { value: { dateISO, at: now.toISOString() } },
        create: { key: LAST_SCAN_KEY, value: { dateISO, at: now.toISOString() } },
      })
      .catch(() => null);
  }

  log.log(
    `📅 ${dateISO}: ${plans.filter((p) => !p.skip).length} batches planned, ${enqueued} enqueued` +
      (queueAvailable ? '' : ' (queue unavailable — will retry next tick)'),
  );

  return {
    dateISO,
    planned: plans.filter((p) => !p.skip).length,
    skipped: plans.filter((p) => p.skip).length,
    enqueued,
    queueAvailable,
    plans,
  };
}

/**
 * Start the always-on tick. Safe to call once per process; returns a stop
 * function so tests and shutdown can clear the interval.
 */
/**
 * Parent-reply SLA + outbox retry sweep. Separate from the daily plan: it must
 * run every 15 minutes, and a failure here must never stop the attendance jobs.
 */
export async function runCommsSweepTick(prisma: any, now: Date = new Date()) {
  const { runCommsSweep } = await import('../modules/comms/dispatch.service');
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_COMMS_KEY } });
  const last = (setting?.value as any)?.at ? new Date((setting?.value as any).at) : null;
  if (last && now.getTime() - last.getTime() < COMMS_SWEEP_MS) return null;
  const result = await runCommsSweep(prisma, now);
  await prisma.appSetting
    .upsert({
      where: { key: LAST_COMMS_KEY },
      update: { value: { at: now.toISOString() } },
      create: { key: LAST_COMMS_KEY, value: { at: now.toISOString() } },
    })
    .catch(() => null);
  return result;
}

/**
 * Weekly DPDP retention purge. Dry-run by default: a deployment only starts
 * deleting history once `retentionEnabled` is set to true in app_settings.
 */
export async function runRetentionTick(prisma: any, now: Date = new Date()) {
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_RETENTION_KEY } });
  const last = (setting?.value as any)?.at ? new Date((setting?.value as any).at) : null;
  if (last && now.getTime() - last.getTime() < RETENTION_MS) return null;
  const enabled = !!(setting?.value as any)?.enabled;
  const { runRetention } = await import('../modules/privacy/retention.service');
  const result = await runRetention(prisma, { dryRun: !enabled, now });
  await prisma.appSetting
    .upsert({
      where: { key: LAST_RETENTION_KEY },
      update: { value: { at: now.toISOString(), enabled } },
      create: { key: LAST_RETENTION_KEY, value: { at: now.toISOString(), enabled } },
    })
    .catch(() => null);
  return result;
}

/**
 * Auto-LWP cut-off (HR spec): a leave nobody decided by its last day is
 * unapproved absence. Runs in the same daily tick as the attendance plan, with
 * its own date stamp so a restart cannot double-apply it.
 */
export async function runLeaveCutoffTick(prisma: any, now: Date = new Date(), force = false) {
  const dateISO = istDateKey(now);
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_LEAVE_CUTOFF_KEY } });
  const already = (setting?.value as any)?.dateISO === dateISO;
  if (already && !force) return { dateISO, autoLwp: 0, employees: 0, skipped: true };

  const pending = await prisma.staffLeave.findMany({
    where: {
      status: { in: [...PENDING_LEAVE_STATUSES] },
      toDate: { lt: new Date(`${dateISO}T00:00:00Z`) },
    },
    select: { id: true, employeeId: true, status: true, toDate: true },
  });
  const outcome = leaveCutoffOutcome(pending, dateISO);

  if (outcome.leaveIds.length) {
    await prisma.staffLeave.updateMany({
      where: { id: { in: outcome.leaveIds } },
      data: { status: AUTO_LWP_STATUS, isLwp: true },
    });
    if (outcome.leaveIds.length) log.log(`Auto-LWP applied to ${outcome.autoLwp} leave(s)`);
  }

  await prisma.appSetting
    .upsert({
      where: { key: LAST_LEAVE_CUTOFF_KEY },
      update: { value: { dateISO, at: now.toISOString(), autoLwp: outcome.autoLwp } },
      create: {
        key: LAST_LEAVE_CUTOFF_KEY,
        value: { dateISO, at: now.toISOString(), autoLwp: outcome.autoLwp },
      },
    })
    .catch(() => null);

  return { dateISO, autoLwp: outcome.autoLwp, employees: outcome.employees, skipped: false };
}

/**
 * Weekly parent digest (email + PDF).
 *
 * Guarded by the ISO week key rather than a timestamp: the tick runs every
 * minute, and only the cadence window (Monday from 08:00 IST) opens the run.
 * Queueing and sending are separate steps so a slow SMTP server cannot block
 * the attendance plan behind it.
 */
export async function runDigestTick(prisma: any, now: Date = new Date()) {
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_DIGEST_KEY } });
  const lastWeek = (setting?.value as any)?.week ?? null;
  const { digestWindowOpen } = await import('../modules/comms/digest.rules');
  const gate = digestWindowOpen(now, lastWeek);
  if (!gate.open) return { week: gate.week, skipped: true, reason: gate.reason };

  const { DigestService } = await import('../modules/comms/digest.service');
  const { PdfService } = await import('../common/pdf/pdf.service');
  const digest = new DigestService(prisma, new PdfService());

  const queued = await digest.run({ now });
  const sent = await digest.flush(200);

  // Only stamp the week once the queue step succeeded — a crash mid-run retries.
  await prisma.appSetting
    .upsert({
      where: { key: LAST_DIGEST_KEY },
      update: { value: { week: gate.week, at: now.toISOString(), queued: queued.queued } },
      create: {
        key: LAST_DIGEST_KEY,
        value: { week: gate.week, at: now.toISOString(), queued: queued.queued },
      },
    })
    .catch(() => null);

  log.log(
    `🗞  weekly digest ${gate.week}: queued=${queued.queued} sent=${sent.sent}` +
      (sent.sandbox ? ' (SMTP not configured — queued only)' : ''),
  );
  return { week: gate.week, skipped: false, queued, sent };
}

/**
 * Daily reorder sweep.
 *
 * Every stock-changing route raises its alert inline, so this exists to catch
 * the changes that happen outside the app (a `psql` correction, a migration, an
 * import) and to keep the open rows' quantities honest. Guarded per IST day so
 * the minute tick runs it once.
 */
export async function runReorderTick(prisma: any, now: Date = new Date()) {
  const dateISO = istDateKey(now);
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_REORDER_KEY } });
  if ((setting?.value as any)?.dateISO === dateISO)
    return { dateISO, skipped: true, reason: 'already swept today' };

  const { ReorderService } = await import('../modules/inventory/reorder.service');
  const result = await new ReorderService(prisma).sweep();

  await prisma.appSetting
    .upsert({
      where: { key: LAST_REORDER_KEY },
      update: { value: { dateISO, at: now.toISOString(), ...result } },
      create: { key: LAST_REORDER_KEY, value: { dateISO, at: now.toISOString(), ...result } },
    })
    .catch(() => null);

  if (result.raised || result.cleared)
    log.log(`📦 reorder sweep: raised=${result.raised} cleared=${result.cleared}`);
  return { dateISO, skipped: false, ...result };
}

export function startScheduler(prisma: any): () => void {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const setting = await prisma.appSetting.findUnique({ where: { key: LAST_SCAN_KEY } });
      const lastRun = (setting?.value as any)?.dateISO ?? null;
      if (shouldRunDailyScan(new Date(), lastRun)) {
        await runDailyScan(prisma, { now: new Date() });
      }
      // Independent guard: a comms failure must not skip the attendance plan.
      await runCommsSweepTick(prisma).catch((err: any) =>
        log.warn(`Comms sweep failed: ${err?.message ?? err}`),
      );
      await runRetentionTick(prisma).catch((err: any) =>
        log.warn(`Retention check failed: ${err?.message ?? err}`),
      );
      await runLeaveCutoffTick(prisma).catch((err: any) =>
        log.warn(`Leave cut-off failed: ${err?.message ?? err}`),
      );
      await runDigestTick(prisma).catch((err: any) =>
        log.warn(`Weekly digest failed: ${err?.message ?? err}`),
      );
      await runReorderTick(prisma).catch((err: any) =>
        log.warn(`Reorder sweep failed: ${err?.message ?? err}`),
      );
    } catch (err: any) {
      log.warn(`Daily attendance plan not derived: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  };

  // Register the repeatable job too, so a multi-replica deploy plans only once.
  // 23:30 UTC = 05:00 IST.
  bbQueue
    .upsertJobScheduler(
      REPEAT_JOB_ID,
      { pattern: '30 23 * * *' }, // 23:30 UTC = 05:00 IST
      { name: 'daily-attendance-plan', data: {}, opts: { removeOnComplete: 30 } },
    )
    .catch(() => log.warn('Redis unavailable — falling back to the in-process scheduler tick'));

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  void tick(); // catch up immediately if the process started after 05:00

  return () => clearInterval(timer);
}

export { LAST_SCAN_KEY };

import { runRetention } from '../src/modules/privacy/retention.service';
import { retentionPlan } from '../src/modules/privacy/privacy.rules';

/**
 * Regression guard for the retention job's column names.
 *
 * The service takes `prisma: any`, so TypeScript cannot check the query
 * arguments — a wrong field name (it used `auditLog.createdAt`, the column is
 * `changedAt`) typechecks fine, throws at 03:00 in production, and the
 * scheduler swallows it as a warning. The nightly purge then silently never
 * runs. These tests assert the exact `where` clauses against a fake client.
 */
function fakePrisma(overrides: Record<string, any> = {}) {
  const calls: { model: string; op: string; args: any }[] = [];
  const rec = (model: string, op: string, result: any) =>
    jest.fn(async (args: any) => {
      calls.push({ model, op, args });
      return result;
    });
  const prisma: any = {
    appSetting: { findUnique: rec('appSetting', 'findUnique', null) },
    messageLog: {
      count: rec('messageLog', 'count', 3),
      deleteMany: rec('messageLog', 'deleteMany', { count: 3 }),
    },
    parentMessage: {
      count: rec('parentMessage', 'count', 2),
      deleteMany: rec('parentMessage', 'deleteMany', { count: 2 }),
    },
    pushSubscription: {
      count: rec('pushSubscription', 'count', 1),
      deleteMany: rec('pushSubscription', 'deleteMany', { count: 1 }),
    },
    auditLog: { count: rec('auditLog', 'count', 9) },
    student: { count: rec('student', 'count', 4) },
  };
  Object.assign(prisma, overrides);
  return { prisma, calls };
}

const find = (calls: any[], model: string, op: string) =>
  calls.find((c) => c.model === model && c.op === op);

describe('DPDP retention job', () => {
  const now = new Date('2026-10-22T03:00:00Z');

  it('counts audit rows by changedAt — the column that actually exists', async () => {
    const { prisma, calls } = fakePrisma();
    const plan = retentionPlan({}, now);
    await runRetention(prisma, { now, dryRun: true });

    const audit = find(calls, 'auditLog', 'count');
    expect(audit).toBeDefined();
    expect(Object.keys(audit!.args.where)).toEqual(['changedAt']);
    expect(audit!.args.where.changedAt.lt).toEqual(plan.auditBefore);
  });

  it('is a dry run by default: counts everything, deletes nothing', async () => {
    const { prisma, calls } = fakePrisma();
    const result = await runRetention(prisma, { now });

    expect(result.dryRun).toBe(true);
    expect(result.purged).toEqual({ messages: 0, conversations: 0, pushSubscriptions: 0 });
    expect(result.kept).toEqual({ audit: 9, students: 4 });
    expect(calls.some((c) => c.op === 'deleteMany')).toBe(false);
  });

  it('touches only read conversations and expired push subscriptions when real', async () => {
    const { prisma, calls } = fakePrisma();
    await runRetention(prisma, { now, dryRun: false });

    const conv = find(calls, 'parentMessage', 'deleteMany');
    expect(conv!.args.where.readAt).toEqual({ not: null });
    const push = find(calls, 'pushSubscription', 'deleteMany');
    expect(Object.keys(push!.args.where)).toEqual(['updatedAt']);
    expect(calls.find((c) => c.model === 'messageLog' && c.op === 'deleteMany')).toBeDefined();
  });

  it('never deletes audit rows or student records', async () => {
    const { prisma, calls } = fakePrisma();
    await runRetention(prisma, { now, dryRun: false });
    expect(calls.filter((c) => c.model === 'auditLog').map((c) => c.op)).toEqual(['count']);
    expect(calls.filter((c) => c.model === 'student').map((c) => c.op)).toEqual(['count']);
  });

  it('uses the stored policy from app_settings and lets a caller override it', async () => {
    const stored = { findUnique: jest.fn(async () => ({ value: { messageDays: 30 } })) };
    const { prisma, calls } = fakePrisma({ appSetting: stored });
    const plan = retentionPlan({ messageDays: 30 }, now);
    await runRetention(prisma, { now });
    expect(find(calls, 'messageLog', 'count')!.args.where.createdAt.lt).toEqual(plan.messageBefore);

    const { prisma: p2, calls: c2 } = fakePrisma({ appSetting: stored });
    const override = retentionPlan({ messageDays: 7 }, now);
    await runRetention(p2, { now, policy: { messageDays: 7 } });
    expect(find(c2, 'messageLog', 'count')!.args.where.createdAt.lt).toEqual(
      override.messageBefore,
    );
  });

  it('fails loudly when a query is wrong, instead of hiding behind the scheduler', async () => {
    const { prisma } = fakePrisma({
      auditLog: {
        count: jest.fn(async () => {
          throw new Error('Unknown argument `createdAt`');
        }),
      },
    });
    await expect(runRetention(prisma, { now })).rejects.toThrow('Unknown argument');
  });
});

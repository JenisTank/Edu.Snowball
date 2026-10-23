import { Logger } from '@nestjs/common';

import { retentionPlan, type RetentionPolicy } from './privacy.rules';

/**
 * Retention job (DPDP §8(8): erase personal data once the purpose is served).
 *
 * Deliberately conservative:
 *  - financial and audit records are never touched by this job,
 *  - a dry run is the default, so the first run shows what *would* go,
 *  - the policy is stored in app_settings and can be changed without a deploy.
 */

const log = new Logger('DPDP');
export const RETENTION_KEY = 'privacy.retention';

export async function loadRetentionPolicy(prisma: any): Promise<Partial<RetentionPolicy>> {
  const row = await prisma.appSetting
    .findUnique({ where: { key: RETENTION_KEY } })
    .catch(() => null);
  return (row?.value as Partial<RetentionPolicy>) ?? {};
}

export interface RetentionRun {
  dryRun: boolean;
  plan: ReturnType<typeof retentionPlan>;
  purged: { messages: number; conversations: number; pushSubscriptions: number };
  kept: { audit: number; students: number };
}

export async function runRetention(
  prisma: any,
  opts: { dryRun?: boolean; now?: Date; policy?: Partial<RetentionPolicy> } = {},
): Promise<RetentionRun> {
  const now = opts.now ?? new Date();
  const stored = await loadRetentionPolicy(prisma);
  const plan = retentionPlan({ ...stored, ...opts.policy }, now);
  const dryRun = opts.dryRun !== false;

  const [messages, conversations, pushSubscriptions] = await Promise.all([
    prisma.messageLog.count({ where: { createdAt: { lt: plan.messageBefore } } }),
    prisma.parentMessage.count({
      where: { createdAt: { lt: plan.conversationBefore }, readAt: { not: null } },
    }),
    prisma.pushSubscription.count({ where: { updatedAt: { lt: plan.pushBefore } } }),
  ]);

  // Audit rows and student records are reported, never deleted here.
  const [audit, students] = await Promise.all([
    prisma.auditLog.count({ where: { changedAt: { lt: plan.auditBefore } } }),
    prisma.student.count({
      where: {
        status: { in: ['TC_ISSUED', 'GRADUATED', 'WITHDRAWN'] },
        updatedAt: { lt: plan.studentBefore },
      },
    }),
  ]);

  const purged = { messages: 0, conversations: 0, pushSubscriptions: 0 };
  if (!dryRun) {
    purged.messages = (
      await prisma.messageLog.deleteMany({ where: { createdAt: { lt: plan.messageBefore } } })
    ).count;
    purged.conversations = (
      await prisma.parentMessage.deleteMany({
        where: { createdAt: { lt: plan.conversationBefore }, readAt: { not: null } },
      })
    ).count;
    purged.pushSubscriptions = (
      await prisma.pushSubscription.deleteMany({ where: { updatedAt: { lt: plan.pushBefore } } })
    ).count;
    log.log(
      `retention run: ${purged.messages} messages, ${purged.conversations} conversations, ${purged.pushSubscriptions} push subscriptions`,
    );
  }

  return { dryRun, plan, purged, kept: { audit, students } };
}

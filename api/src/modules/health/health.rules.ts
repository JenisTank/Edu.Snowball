/**
 * Health summary rules.
 *
 * Kept pure so the pass/fail decision is unit-tested rather than discovered in
 * production: a monitor should page on `degraded`, and a human should be able to
 * read `issues` and know which dependency to look at first.
 */

export type CheckState = 'up' | 'down' | 'skipped';

export interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface HealthInput {
  database: CheckState;
  redis: CheckState;
  queue: QueueCounts | null;
}

export interface HealthSummary {
  status: 'ok' | 'degraded';
  issues: string[];
}

/** Failed jobs above this count mean messages are silently piling up. */
export const FAILED_JOB_THRESHOLD = 50;

export function summariseHealth(input: HealthInput): HealthSummary {
  const issues: string[] = [];

  if (input.database === 'down') issues.push('database unreachable');
  if (input.redis === 'down') issues.push('redis unreachable — queued jobs will not run');
  if (input.queue && input.queue.failed >= FAILED_JOB_THRESHOLD)
    issues.push(`${input.queue.failed} failed jobs in the queue`);

  return { status: issues.length ? 'degraded' : 'ok', issues };
}

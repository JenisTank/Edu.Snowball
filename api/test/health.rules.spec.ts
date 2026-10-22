import { FAILED_JOB_THRESHOLD, summariseHealth } from '../src/modules/health/health.rules';

const queue = { waiting: 3, active: 1, failed: 0, delayed: 0 };

describe('health summary', () => {
  it('is ok when every dependency answers', () => {
    expect(summariseHealth({ database: 'up', redis: 'up', queue })).toEqual({
      status: 'ok',
      issues: [],
    });
  });

  it('degrades loudly when the database is unreachable', () => {
    const s = summariseHealth({ database: 'down', redis: 'up', queue });
    expect(s.status).toBe('degraded');
    expect(s.issues[0]).toMatch(/database/);
  });

  it('explains that Redis down means jobs stop', () => {
    const s = summariseHealth({ database: 'up', redis: 'down', queue: null });
    expect(s.status).toBe('degraded');
    expect(s.issues).toEqual([expect.stringMatching(/redis unreachable/)]);
  });

  it('only complains about queue failures past the threshold', () => {
    const warning = { ...queue, failed: FAILED_JOB_THRESHOLD - 1 };
    expect(summariseHealth({ database: 'up', redis: 'up', queue: warning }).status).toBe('ok');
    const bad = { ...queue, failed: FAILED_JOB_THRESHOLD };
    const s = summariseHealth({ database: 'up', redis: 'up', queue: bad });
    expect(s.status).toBe('degraded');
    expect(s.issues[0]).toContain(String(FAILED_JOB_THRESHOLD));
  });

  it('reports both problems when two dependencies are down', () => {
    const s = summariseHealth({ database: 'down', redis: 'down', queue: null });
    expect(s.issues).toHaveLength(2);
  });
});

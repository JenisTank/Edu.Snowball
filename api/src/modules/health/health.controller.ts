import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';
import { env } from '../../config/env';
import { queueHealth } from '../../jobs/queue';
import { HealthSummary, summariseHealth } from './health.rules';
import { pingRedis } from './redis.check';

/**
 * Liveness + readiness probe for Docker, uptime monitors and the runbook.
 *
 * `/api/health` always answers 200 with a body a human can read; `/api/health/ready`
 * answers 503 when a dependency is down so a load balancer stops sending traffic.
 * Both are unauthenticated and must stay cheap — no table scans, no PII.
 */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  private async snapshot() {
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const redis = (await pingRedis()) ? ('up' as const) : ('down' as const);
    const queue = redis === 'up' ? await queueHealth() : null;
    const summary = summariseHealth({ database, redis, queue });

    return {
      ...summary,
      database,
      redis,
      queue,
      version: env.release,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  check() {
    return this.snapshot();
  }

  @Get('ready')
  async ready() {
    const snapshot = await this.snapshot();
    if (snapshot.status !== 'ok') throw new ServiceUnavailableException(snapshot);
    return snapshot;
  }
}

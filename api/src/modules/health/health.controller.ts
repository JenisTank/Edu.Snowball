import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';

/**
 * Unauthenticated liveness probe for Docker / uptime monitors.
 * Reports a degraded state when the database is unreachable, so a broken
 * deploy fails loudly instead of looking healthy.
 */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Liveness/readiness probe for Docker, the VPS reverse proxy and uptime
// monitors. Deliberately unauthenticated and leaks nothing but a timestamp.
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    let db = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, at: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController], providers: [PrismaService] })
export class HealthModule {}

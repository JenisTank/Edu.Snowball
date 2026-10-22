import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Single Prisma client for the whole process, global so any provider can
 * inject it.
 *
 * Before this module existed every feature module listed `PrismaService` in
 * its own `providers`, which created one independent PrismaClient — and one
 * connection pool — per module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { PrismaService } from './common/database/prisma.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation/validation';
import { env, validateEnv } from './config/env';
import { startWorker } from './jobs/queue';
import { startScheduler } from './jobs/scheduler';
import { initSentry } from './common/observability/sentry';

async function bootstrap() {
  validateEnv();
  // Error reporting first: a crash during bootstrap should still be reported.
  if (initSentry()) new Logger('Bootstrap').log('🔭 Sentry error reporting enabled');

  // rawBody: the Razorpay webhook is verified against the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(env.port, '0.0.0.0');
  new Logger('Bootstrap').log(`🐝 BumbleB Kidz API listening on :${env.port}/api`);

  // BullMQ worker: absence scans, admin-call lists and reminders (Redis-backed).
  // Reuses the Nest-managed Prisma client, so the process keeps one pool.
  startWorker(app.get(PrismaService) as any);
  new Logger('Bootstrap').log('📨 Message queue worker started');

  // 05:00 IST daily attendance plan — the safety net no longer depends on a
  // teacher opening the register (see jobs/scheduler.ts).
  const stopScheduler = startScheduler(app.get(PrismaService) as any);
  process.once('SIGTERM', stopScheduler);
  process.once('SIGINT', stopScheduler);
  new Logger('Bootstrap').log('📅 Attendance scheduler armed');
}

void bootstrap();

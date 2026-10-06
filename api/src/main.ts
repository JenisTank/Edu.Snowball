import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaClient } from '@prisma/client';
import { startWorker } from './modules/queue';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🐝 BumbleB Kidz API running on port ${port}`);
  // BullMQ worker: absence scans, admin-call lists (Redis-backed)
  startWorker(new PrismaClient());
  console.log('📨 Message queue worker started');
}
bootstrap();

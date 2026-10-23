import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Unauthenticated liveness probe used by Docker and uptime monitors. */
@Module({ controllers: [HealthController] })
export class HealthModule {}

import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';

/** Cross-module founder dashboard. */
@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}

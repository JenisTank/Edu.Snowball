import { Module } from '@nestjs/common';

import { FeeAddonsController } from './addons.controller';
import { FeeReportsController } from './reports.controller';
import { FeesController } from './fees.controller';

/**
 * Fees: locked structures, instalments, receipts, reminders, add-on charges
 * and the 14 statutory reports.
 */
@Module({ controllers: [FeesController, FeeReportsController, FeeAddonsController] })
export class FeesModule {}

import { Module } from '@nestjs/common';

import { FeesController } from './fees.controller';

/** Fees: locked structures, instalments, receipts and reminders. */
@Module({ controllers: [FeesController] })
export class FeesModule {}

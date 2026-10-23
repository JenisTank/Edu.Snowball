import { Module } from '@nestjs/common';

import { BatchesAdminController, BatchesController } from './batches.controller';
import { ProgrammesController } from './programmes.controller';
import { UnitsAdminController, UnitsController } from './units.controller';

/** Unit, programme and batch masters — batch timings drive the attendance lock. */
@Module({
  controllers: [
    UnitsController,
    UnitsAdminController,
    ProgrammesController,
    BatchesController,
    BatchesAdminController,
  ],
})
export class UnitsModule {}

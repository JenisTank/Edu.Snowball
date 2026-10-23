import { Module } from '@nestjs/common';

import { EveningController } from './evening.controller';

/** Evening activity centre — separate fee ledger from preschool. */
@Module({ controllers: [EveningController] })
export class EveningModule {}

import { Module } from '@nestjs/common';

import { LeavesController } from './leaves.controller';

/** Student leave applications — the only input that silences absence alerts. */
@Module({ controllers: [LeavesController] })
export class LeavesModule {}

import { Module } from '@nestjs/common';

import { PtmController } from './ptm.controller';

/** Parent-teacher meetings: sessions and per-student records. */
@Module({ controllers: [PtmController] })
export class PtmModule {}

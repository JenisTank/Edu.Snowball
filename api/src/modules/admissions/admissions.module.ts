import { Module } from '@nestjs/common';

import { AdmissionsController } from './admissions.controller';

/** Admission flow: register → Discovery Flight → CH approval → confirm. */
@Module({ controllers: [AdmissionsController] })
export class AdmissionsModule {}

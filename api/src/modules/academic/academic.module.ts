import { Module } from '@nestjs/common';

import { AcademicController } from './academic.controller';

/** Academic planning: yearly goals, big rocks, calendar, log plan. */
@Module({ controllers: [AcademicController] })
export class AcademicModule {}

import { Module } from '@nestjs/common';

import { FrontDeskController } from './frontdesk.controller';

/** Visitor book and security-deposit register. */
@Module({ controllers: [FrontDeskController] })
export class FrontDeskModule {}

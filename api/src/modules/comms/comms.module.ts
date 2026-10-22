import { Module } from '@nestjs/common';

import { CommsController } from './comms.controller';

/** Communication centre: single outbox for every parent-facing message. */
@Module({ controllers: [CommsController] })
export class CommsModule {}

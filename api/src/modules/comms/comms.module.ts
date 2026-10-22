import { Module } from '@nestjs/common';

import { CommsController } from './comms.controller';
import { CommsDispatchService } from './dispatch.service';

/**
 * Communication centre: single outbox, channel fallback (push → WhatsApp →
 * email), HO template management and the parent-reply SLA.
 */
@Module({
  controllers: [CommsController],
  providers: [CommsDispatchService],
  exports: [CommsDispatchService],
})
export class CommsModule {}

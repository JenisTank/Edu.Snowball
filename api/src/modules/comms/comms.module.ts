import { Module } from '@nestjs/common';

import { CommsController } from './comms.controller';
import { CommsDispatchService } from './dispatch.service';
import { DigestService } from './digest.service';
import { PdfModule } from '../../common/pdf/pdf.module';

/**
 * Communication centre: single outbox, channel fallback (push → WhatsApp →
 * email), HO template management and the parent-reply SLA.
 */
@Module({
  imports: [PdfModule],
  controllers: [CommsController],
  providers: [CommsDispatchService, DigestService],
  exports: [CommsDispatchService, DigestService],
})
export class CommsModule {}

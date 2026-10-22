import { Module } from '@nestjs/common';

import { OnlinePaymentsController } from './online-payments.controller';
import { OnlineSettlementService } from './online-settlement.service';
import { WebhooksController } from './webhooks.controller';

/** Razorpay integration: order creation, settlement, webhook. */
@Module({
  controllers: [OnlinePaymentsController, WebhooksController],
  providers: [OnlineSettlementService],
  exports: [OnlineSettlementService],
})
export class PaymentsModule {}

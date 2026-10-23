import { Module } from '@nestjs/common';

import { UpiPaymentsController } from './upi-payments.controller';
import { OnlineSettlementService } from './online-settlement.service';

/**
 * UPI collection: intent + QR per amount, parent claim, desk confirmation.
 * No payment gateway is involved, so there is no webhook and no merchant KYC.
 */
@Module({
  controllers: [UpiPaymentsController],
  providers: [OnlineSettlementService],
  exports: [OnlineSettlementService],
})
export class PaymentsModule {}

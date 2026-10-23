import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { ProcurementController } from './procurement.controller';
import { InwardOutwardController } from './register.controller';
import { ReorderService } from './reorder.service';

/** Inventory stock ledger, procurement, register and reorder alerts. */
@Module({
  controllers: [InventoryController, ProcurementController, InwardOutwardController],
  providers: [ReorderService],
  exports: [ReorderService],
})
export class InventoryModule {}

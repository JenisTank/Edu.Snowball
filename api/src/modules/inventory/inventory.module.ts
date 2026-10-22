import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';
import { ProcurementController } from './procurement.controller';
import { InwardOutwardController } from './register.controller';

/** Inventory stock ledger and movement history. */
@Module({ controllers: [InventoryController, ProcurementController, InwardOutwardController] })
export class InventoryModule {}

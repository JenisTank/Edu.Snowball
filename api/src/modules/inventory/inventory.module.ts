import { Module } from '@nestjs/common';

import { InventoryController } from './inventory.controller';

/** Inventory stock ledger and movement history. */
@Module({ controllers: [InventoryController] })
export class InventoryModule {}

import { Module } from '@nestjs/common';

import { ParentController } from './parents.controller';

/** Parent portal API (PWA): per-child login, ledger, documents, push. */
@Module({ controllers: [ParentController] })
export class ParentModule {}

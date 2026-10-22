import { Module } from '@nestjs/common';

import { AuditController } from './audit.controller';

/** Read-only audit trail — every mutation in the system is recorded. */
@Module({ controllers: [AuditController] })
export class AuditLogModule {}

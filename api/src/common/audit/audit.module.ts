import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/** System rule 3: every mutation is written to the audit log. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth';
import { ErpModule } from './modules/erp.controller';
import { AdminModule } from './modules/admin.controller';
import { CrmModule } from './modules/crm.controller';
import { AdmissionsModule } from './modules/admissions.controller';
import { AttendanceModule } from './modules/attendance.controller';
import { FeesModule } from './modules/fees.controller';
import { ParentModule } from './modules/parent.controller';
import { CertificatesModule } from './modules/certs.controller';
import { CommsModule } from './modules/comms.controller';
import { PaymentsModule } from './modules/payments.controller';
import { DocumentsModule } from './modules/documents.controller';
import { DpdpModule } from './modules/dpdp.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ErpModule, AdminModule, CrmModule, AdmissionsModule, AttendanceModule, FeesModule, ParentModule, CertificatesModule, CommsModule, PaymentsModule, DocumentsModule, DpdpModule],
})
export class AppModule {}

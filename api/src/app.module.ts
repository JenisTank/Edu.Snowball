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
import { LifecycleModule } from './modules/lifecycle.controller';
import { AcademicModule } from './modules/academic.controller';
import { InventoryModule } from './modules/inventory.controller';
import { PtmModule } from './modules/ptm.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ErpModule, AdminModule, CrmModule, AdmissionsModule, AttendanceModule, FeesModule, ParentModule, CertificatesModule, CommsModule, LifecycleModule, AcademicModule, InventoryModule, PtmModule],
})
export class AppModule {}

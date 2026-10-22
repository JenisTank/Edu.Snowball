import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from './common/audit/audit.module';
import { PrismaModule } from './common/database/prisma.module';
import { PdfModule } from './common/pdf/pdf.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditLogModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { CommsModule } from './modules/comms/comms.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EveningModule } from './modules/evening/evening.module';
import { FeesModule } from './modules/fees/fees.module';
import { HealthModule } from './modules/health/health.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ParentModule } from './modules/parents/parents.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { PtmModule } from './modules/ptm/ptm.module';
import { StudentsModule } from './modules/students/students.module';
import { ThemeModule } from './modules/theme/theme.module';
import { UnitsModule } from './modules/units/units.module';
import { UsersModule } from './modules/users/users.module';

/**
 * BumbleB Kidz ERP — application root.
 *
 * Global infrastructure (database, audit log, notifications, auth) is wired
 * once here; feature modules only declare their own controllers.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit; auth endpoints override it with stricter limits.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    PdfModule,
    AuthModule,
    UsersModule,
    UnitsModule,
    StudentsModule,
    DashboardModule,
    CrmModule,
    AdmissionsModule,
    AttendanceModule,
    FeesModule,
    ParentModule,
    PaymentsModule,
    CertificatesModule,
    CommsModule,
    LifecycleModule,
    AcademicModule,
    InventoryModule,
    LeavesModule,
    PtmModule,
    PrivacyModule,
    EveningModule,
    HrModule,
    HealthModule,
    AnalyticsModule,
    AuditLogModule,
    ThemeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

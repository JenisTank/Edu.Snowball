import { Module } from '@nestjs/common';

import { AttendanceController } from './attendance.controller';

/** Attendance engine: default ABSENT, dynamic lock, absence escalation. */
@Module({ controllers: [AttendanceController] })
export class AttendanceModule {}

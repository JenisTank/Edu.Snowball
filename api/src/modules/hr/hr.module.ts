import { Module } from '@nestjs/common';

import { EmployeesController } from './employees.controller';
import { LeaveController } from './leave.controller';
import { MeController } from './me.controller';
import { MastersController } from './masters.controller';
import { OvertimeController } from './overtime.controller';
import { PayrollController } from './payroll.controller';
import { StaffAttendanceController } from './staff-attendance.controller';

/** HR, staff attendance and the dual (morning/evening) payroll engines. */
@Module({
  controllers: [
    EmployeesController,
    LeaveController,
    MeController,
    MastersController,
    OvertimeController,
    PayrollController,
    StaffAttendanceController,
  ],
})
export class HrModule {}

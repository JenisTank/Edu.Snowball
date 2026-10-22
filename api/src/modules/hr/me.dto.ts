import { IsIn, IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

import { LEAVE_TYPES } from './me.rules';

export class LeaveApplicationDto {
  @IsIn(LEAVE_TYPES as unknown as string[], { message: 'leaveType must be CL, SL or PL' })
  leaveType!: (typeof LEAVE_TYPES)[number];

  @IsISO8601({}, { message: 'fromDate must be YYYY-MM-DD' })
  fromDate!: string;

  @IsISO8601({}, { message: 'toDate must be YYYY-MM-DD' })
  toDate!: string;

  @IsString()
  @MinLength(5, { message: 'Please give a reason of at least 5 characters' })
  @MaxLength(500)
  reason!: string;
}

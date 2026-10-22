import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Student-leave decisions. The note is optional on approval and effectively
 * required by the handlers on rejection — that rule stays in the controller
 * because it depends on which transition is being applied.
 */
export class LeaveDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * A leave request filed for a student. The date ordering and the two-day rule
 * live in `leaves.rules.validateLeave`, called by the controller, because they
 * are policy (the founder has not yet fixed the notice period for every type).
 */
export class CreateStudentLeaveDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsDateString({}, { message: 'fromDate must be an ISO date' })
  fromDate!: string;

  @IsDateString({}, { message: 'toDate must be an ISO date' })
  toDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

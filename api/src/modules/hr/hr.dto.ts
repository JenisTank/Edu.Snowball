import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * HR payloads: employee master, employment history, masters (shifts,
 * holidays, statutory slabs, salary components), leave, overtime, staff
 * attendance corrections and payroll.
 *
 * Statutory identifiers (PAN/UAN/ESIC/bank account) are accepted here as plain
 * strings and encrypted by the controller — validation is about shape only, so
 * an encrypted value is never rejected for looking unlike a PAN.
 */

// Mirrors the controller constants (TYPES / STATUSES) — keep them in step.
export const EMPLOYMENT_TYPES = ['MORNING_SALARIED', 'EVENING_HOURLY', 'DUAL'] as const;
export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_NOTICE', 'RELIEVED', 'SUSPENDED'] as const;
export const LEAVE_TYPES = ['CL', 'SL', 'PL'] as const;
export const STATUTORY_CODES = ['PF', 'ESIC', 'PT'] as const;
export const SALARY_COMPONENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
export const CALCULATION_TYPES = ['FIXED', 'PERCENTAGE'] as const;
export const ADJUSTMENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
export const PAYROLL_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const TIME_HHMM = /^\d{2}:\d{2}$/;

// ───────────────────────── employee master ─────────────────────────

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId!: string;

  @IsString()
  @MaxLength(80)
  designation!: string;

  @IsDateString({}, { message: 'joiningDate must be an ISO date' })
  joiningDate!: string;

  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employmentType!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsUUID('4')
  reportingManagerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankIfsc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  uan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  esicNumber?: string;

  @IsOptional()
  @IsBoolean()
  pfEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  esicEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ptEnabled?: boolean;
}

export class UpdateStatutoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountNo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankIfsc?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  uan?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  esicNumber?: string | null;
}

export class ChangeEmploymentDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  designation?: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employmentType?: string;

  @IsOptional()
  @IsUUID('4')
  reportingManagerId?: string | null;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  relievingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class MinuteRateDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  rate!: number;

  @IsDateString()
  effectiveFrom!: string;

  /** Open-ended by default; a new row closes the previous one. */
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class EmployeeShiftDto {
  @IsUUID('4')
  shiftId!: string;

  @IsDateString()
  effectiveFrom!: string;

  /** Open-ended by default; a new row closes the previous one. */
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class EmployeeComponentDto {
  @IsUUID('4')
  componentId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  value!: number;

  @IsDateString()
  effectiveFrom!: string;

  /** Open-ended by default; a new row closes the previous one. */
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

// ───────────────────────── masters ─────────────────────────

export class StatutorySlabDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxAmount?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deduction!: number;
}

export class CreateStatutorySchemeDto {
  @IsIn(STATUTORY_CODES as unknown as string[])
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  employeeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  employerRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wageCeiling?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  calculationBasis?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatutorySlabDto)
  slabs?: StatutorySlabDto[];
}

export class CreateShiftDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(20)
  code!: string;

  @Matches(TIME_HHMM, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @Matches(TIME_HHMM, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  workingMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  halfDayMinutes!: number;

  /** When overtime becomes payable (HH:MM), optional per shift. */
  @IsOptional()
  @Matches(TIME_HHMM, { message: 'otTriggerTime must be HH:MM' })
  otTriggerTime?: string;
}

export class CreateHolidayDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}

export class CreateSalaryComponentDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsIn(SALARY_COMPONENT_TYPES as unknown as string[])
  type!: string;

  @IsIn(CALCULATION_TYPES as unknown as string[])
  calculationType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  defaultValue?: number;

  @IsOptional()
  @IsBoolean()
  pfApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  esicApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  ptApplicable?: boolean;
}

// ───────────────────────── leave / overtime ─────────────────────────

export class UpsertLeavePolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsIn(LEAVE_TYPES as unknown as string[])
  leaveType!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  allocation!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  carryForwardCap?: number;

  /** Defaults to 1 January of the policy year. */
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class ApplyLeaveDto {
  @IsUUID('4')
  employeeId!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  leaveType?: string;
}

export class ApproveLeaveDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsBoolean()
  isLwp?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class OvertimeRequestDto {
  @IsUUID('4')
  employeeId!: string;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedMinutes!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  /**
   * OT1 is undecided, so 0 is a valid value: the hours are authorised, no
   * premium is paid. Omitted means 0.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(3)
  multiplier?: number;
}

export class ApproveOvertimeDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AttendanceCorrectionDto {
  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsDateString()
  firstIn?: string;

  @IsOptional()
  @IsDateString()
  lastOut?: string;
}

// ───────────────────────── payroll ─────────────────────────

export class ReversePayrollDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class PayrollAdjustmentDto {
  @IsUUID('4')
  employeeId!: string;

  @Matches(PAYROLL_MONTH, { message: 'month must be YYYY-MM' })
  month!: string;

  @IsIn(ADJUSTMENT_TYPES as unknown as string[])
  type!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUUID('4')
  sourceRunId?: string;
}

export class CalculatePayrollDto {
  @Matches(PAYROLL_MONTH, { message: 'Month must be YYYY-MM' })
  month!: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;
}

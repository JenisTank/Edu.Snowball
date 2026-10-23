import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Admissions payloads: Stage-2 registration and the Discovery Flight result.
 *
 * Registration deliberately does not accept an admission number, status or
 * instalment plan — those are derived server-side, so a client cannot mint its
 * own sequence or skip the fee-plan suggestion.
 */

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const RESULT_CODES = ['EP', 'GP', 'SP', 'NP', 'ND'] as const;
export const RECOMMENDATIONS = ['READY', 'READY_WITH_SUPPORT', 'ALTERNATE_LEVEL'] as const;

export class RegisterStudentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsDateString({}, { message: 'dob must be an ISO date' })
  dob!: string;

  @IsOptional()
  @IsIn(GENDERS as unknown as string[])
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fatherPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  motherPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  addressArea?: string;

  @IsUUID('4', { message: 'programmeId must be a UUID' })
  programmeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  /** DPDP consent flags; DATA_PROCESSING is always granted at registration. */
  @IsOptional()
  @IsObject()
  consents?: Record<string, boolean>;
}

export class DiscoveryResultDto {
  @IsIn(RESULT_CODES as unknown as string[], { message: 'resultCode must be EP/GP/SP/NP/ND' })
  resultCode!: string;

  /**
   * Optional: when omitted the rule-derived default for the code is stored
   * (`discovery.rules.ts`). The observer can always override it.
   */
  @IsOptional()
  @IsIn(RECOMMENDATIONS as unknown as string[], { message: 'Invalid recommendation' })
  recommendation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  internalOnly?: boolean;
}

export class ScheduleDiscoveryFlightDto {
  /** Defaults to now — a walk-in flight is recorded at the moment it happens. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class DeclineWaitlistDto {
  /** Why the seat was declined; kept for the enquiry log. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const INSTALMENT_PLANS = ['PLAN_A', 'PLAN_B', 'PLAN_C'] as const;

export class ConfirmAdmissionDto {
  @IsUUID('4', { message: 'batchId must be a UUID' })
  batchId!: string;

  @IsOptional()
  @IsIn(INSTALMENT_PLANS as unknown as string[])
  instalmentPlan?: string;

  @IsOptional()
  @IsDateString()
  orientationDate?: string;

  /** Full batch: queue the child instead of failing the admission. */
  @IsOptional()
  @IsBoolean()
  waitlist?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  waitlistNote?: string;
}

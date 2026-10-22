import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
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

export const EVENING_MODES = ['CASH', 'CHEQUE', 'UPI', 'POS', 'RAZORPAY', 'NEFT'] as const;

/** `HH:MM` (24h) — the evening centre works in clock times, not timestamps. */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateEveningActivityDto {
  @IsOptional()
  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId?: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  schedule?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;
}

/**
 * A child who attends the evening centre but is not a day-programme student —
 * a sibling, a neighbourhood child. A guardian phone is mandatory so a
 * pick-up problem is never untraceable.
 */
export class CreateEveningParticipantDto {
  @IsOptional()
  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId?: string;

  @IsString()
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsISO8601({}, { message: 'dob must be an ISO date' })
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @Matches(/^[+\d][\d\s-]{7,17}$/, { message: 'guardianPhone must be a valid phone number' })
  guardianPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  school?: string;
}

export class EnrolExternalDto {
  @IsUUID('4', { message: 'participantId must be a UUID' })
  participantId!: string;

  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountDue?: number;
}

export class EnrolStudentDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountDue?: number;
}

export class CreateEveningSessionDto {
  /** Session date (YYYY-MM-DD); one session per activity per date. */
  @IsISO8601({}, { message: 'date must be an ISO date (YYYY-MM-DD)' })
  date!: string;

  @IsOptional()
  @Matches(CLOCK, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @IsOptional()
  @Matches(CLOCK, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;
}

export class EveningAttendanceEntryDto {
  @IsOptional()
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'participantId must be a UUID' })
  participantId?: string;

  @IsIn(['PRESENT', 'ABSENT'], { message: 'status must be PRESENT or ABSENT' })
  status!: 'PRESENT' | 'ABSENT';
}

export class MarkEveningAttendanceDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one entry is required' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => EveningAttendanceEntryDto)
  entries!: EveningAttendanceEntryDto[];
}

export class EveningPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(EVENING_MODES, { message: `mode must be one of ${EVENING_MODES.join(', ')}` })
  mode?: (typeof EVENING_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

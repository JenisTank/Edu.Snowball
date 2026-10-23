import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE'] as const;

export class AttendanceEntryDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  /** Defaults to ABSENT in the database — a teacher must actively mark PRESENT. */
  @IsIn(ATTENDANCE_STATUSES, { message: 'status must be PRESENT, ABSENT or LEAVE' })
  status!: (typeof ATTENDANCE_STATUSES)[number];
}

export class MarkAttendanceDto {
  @IsUUID('4', { message: 'batchId must be a UUID' })
  batchId!: string;

  /** Roster date (YYYY-MM-DD); defaults to today. */
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one student entry is required' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];

  /** Required by Centre Heads (or above) when marking after the class lock. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;
}

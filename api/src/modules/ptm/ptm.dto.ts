import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * PTM payloads.
 *
 * Bodies used to be typed `any`, which meant a typo in a field name silently
 * created a half-filled row. With the global ValidationPipe these classes
 * reject malformed input with a 400 and strip unknown keys, while the
 * controller keeps the business rules (unit scope, who may book for whom).
 */
export class CreatePtmSessionDto {
  /** Required for Head Office users; ignored for unit-scoped staff. */
  @IsOptional()
  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  /** ISO date-time of the meeting; the roster is built from the unit/batch. */
  @IsISO8601({}, { message: 'scheduledAt must be an ISO date-time' })
  scheduledAt!: string;

  /** Optional: restrict the roster to a single batch. */
  @IsOptional()
  @IsUUID('4', { message: 'batchId must be a UUID' })
  batchId?: string;
}

export class GeneratePtmSlotsDto {
  /** First slot start; defaults to the session's scheduled time. */
  @IsOptional()
  @IsISO8601({}, { message: 'startTime must be an ISO date-time' })
  startTime?: string;

  /** Number of consecutive slots to create (1–60). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  count?: number;

  /** Length of each slot in minutes (5–60). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(60)
  minutes?: number;
}

export class BookPtmSlotDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  /** Optional note the teacher should see before the meeting. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Partial update of one child's PTM record. Every field is optional so that the
 * "mark attended" toggle cannot wipe notes typed by a teacher.
 */
export class UpdatePtmRecordDto {
  @IsOptional()
  @IsBoolean()
  attended?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentNames?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  signedFormUrl?: string | null;
}

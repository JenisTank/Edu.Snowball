import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request bodies for unit and batch administration.
 *
 * Every field is optional on update (PATCH semantics: absent means "leave it
 * alone"), but the type and the format are enforced, so `capacity: "twelve"`
 * or `startTime: "9am"` can no longer reach Prisma.
 */

export const UNIT_STATUSES = ['ACTIVE', 'INACTIVE', 'UPCOMING'] as const;
export const TIME_HHMM = /^\d{2}:\d{2}$/;

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsIn(UNIT_STATUSES as unknown as string[])
  status?: string;
}

export class UpdateUnitSettingsDto {
  /** Founder-locked financial master — the controller re-checks the role. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pettyCashFloat?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  admissionNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  calendlyLink?: string;
}

export class CreateBatchDto {
  @IsString()
  unitId!: string;

  @IsString()
  programmeId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  medium?: string;

  @IsString()
  shift!: string;

  @Matches(TIME_HHMM, { message: 'startTime must be HH:MM (drives the attendance lock)' })
  startTime!: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  academicYear?: string;
}

export class UpdateBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  medium?: string;

  @IsOptional()
  @IsString()
  shift?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  programmeId?: string;
}

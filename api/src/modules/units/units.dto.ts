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

  /** Front-desk number printed on letters and shown in the parent app. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[+0-9][0-9\s-]{5,19}$/, { message: 'phone must be a dialable number' })
  phone?: string;

  /**
   * UPI collection id (name@bank). Validated here, not only in the QR builder,
   * so a typo cannot be saved and then silently pay nobody.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^([a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64})?$/, {
    message: 'upiVpa must look like name@bank (or be empty to disable UPI)',
  })
  upiVpa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  upiPayeeName?: string;

  /** Professional Tax default for staff in this unit. */
  @IsOptional()
  @IsBoolean()
  ptEnabled?: boolean;
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

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PLAN_KINDS, PLAN_STATUSES } from './academic.rules';

/** Payload for a new academic record. */
export class CreateAcademicPlanDto {
  @IsIn(PLAN_KINDS as unknown as string[], {
    message: `kind must be one of ${PLAN_KINDS.join(', ')}`,
  })
  kind!: string;

  @IsString()
  @MinLength(2, { message: 'A title is required' })
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** Omit for a Head Office master; set it for a unit record. */
  @IsOptional()
  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'programmeId must be a UUID' })
  programmeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  academicYear?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  parentVisible?: boolean;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  /** Set to adapt a locked Head Office master. */
  @IsOptional()
  @IsUUID('4', { message: 'masterId must be a UUID' })
  masterId?: string;
}

/** Partial edit of a plan. Version and lock fields are never client-set. */
export class UpdateAcademicPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'A title is required' })
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be an ISO date' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'endDate must be an ISO date' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  parentVisible?: boolean;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ChangePlanStatusDto {
  @IsIn(PLAN_STATUSES as unknown as string[], {
    message: `status must be one of ${PLAN_STATUSES.join(', ')}`,
  })
  status!: string;
}

export class LockPlanDto {
  /** Optional note explaining the lock; stored in the audit trail. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateOverlayDto {
  @IsOptional()
  @IsUUID('4', { message: 'unitId must be a UUID' })
  unitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'A title is required' })
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

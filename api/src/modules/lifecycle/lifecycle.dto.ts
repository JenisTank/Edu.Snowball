import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Lifecycle tabs (26-tab student record).
 *
 * The payload shape is validated twice on purpose: here the generic shape (an
 * object payload, a bounded title), and in `lifecycle.rules.ts` the
 * tab-specific rules the SOP actually cares about.
 */

export class CreateLifecycleRecordDto {
  /**
   * The tab list lives in the controller (`LIFECYCLE_TABS`) because it also
   * carries each tab's visibility. Duplicating it here would let the two drift,
   * so this stays a string and the controller rejects unknown tabs.
   */
  @IsString()
  @MaxLength(40)
  tab!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;
}

export class UpdateLifecycleRecordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;
}

export class PromoteStudentDto {
  @IsString()
  @MaxLength(40)
  programmeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  batchId?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

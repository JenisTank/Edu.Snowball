import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DPDP operations.
 *
 * `purge` and `erase` are destructive, so the DTO still requires the typed
 * confirmation word — the controller decides what the word must be, because it
 * differs per operation (PURGE vs ERASE) and that difference is the safeguard.
 */
export class ConsentRecordDto {
  @IsObject()
  decisions!: Record<string, boolean>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  grantedBy?: string;
}

export class RetentionPurgeDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  confirm?: string;
}

export class EraseStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  confirm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Retention windows, in days. Each field is optional — an operator may adjust
 * one window without restating the rest — but anything supplied must be a whole
 * number of days within the range the retention job can honour.
 */
export class RetentionPolicyDto {
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(36500)
  messageDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(36500)
  conversationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(36500)
  pushDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(36500)
  auditDays?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(36500)
  studentDays?: number;
}

import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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

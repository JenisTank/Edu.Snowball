import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * HO template edit.
 *
 * Only the wording and the WhatsApp approval linkage change — the `code` stays
 * fixed because every dispatch path looks templates up by code, and a renamed
 * code would silently stop the absence alerts.
 */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  /** BSP template name; empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  metaTemplate?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AnnouncementDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @MaxLength(4000)
  body!: string;

  /** Head Office may target a unit; unit staff are pinned to their own. */
  @IsOptional()
  @IsUUID('4')
  unitId?: string;
}

export class ReplyParentMessageDto {
  @IsString()
  @MaxLength(1000)
  body!: string;
}

export class CreateTemplateDto {
  @IsString()
  @MaxLength(60)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsString()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  metaTemplate?: string;
}

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import { DOCUMENT_KINDS } from './storage.rules';

/**
 * The file itself arrives base64-encoded in JSON.
 *
 * Multipart would be tidier on the wire, but the API has no file-upload
 * middleware and one more dependency plus a parser is a worse trade than a
 * 10 MB base64 field — which is exactly the cap the rule enforces.
 */
export class UploadDocumentDto {
  @IsIn(DOCUMENT_KINDS)
  kind!: (typeof DOCUMENT_KINDS)[number];

  @IsString()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  /** base64 (no data: prefix). */
  @IsString()
  contentBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class DeleteDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class StudentParamDto {
  @IsUUID('4')
  studentId!: string;
}

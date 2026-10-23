import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Certificate issue request.
 *
 * Financial document types (NO_DUES, TRANSFER) are gated inside the controller
 * against live fee data, so the DTO only carries the intent — it never carries
 * a "you may skip the gate" flag.
 */
export class IssueCertificateDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsString()
  @MaxLength(40)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  event?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Staff confirmation that dues were checked before issuing a financial doc. */
  @IsOptional()
  @IsBoolean()
  noDuesConfirmed?: boolean;
}

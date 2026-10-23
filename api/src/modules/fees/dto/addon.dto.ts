import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PAYMENT_MODES } from './payment.dto';

/**
 * Add-on charges (kit, transport, event fee). They are billed separately from
 * the annual tuition schedule, so they never re-allocate instalments.
 */

export class CreateAddonDto {
  @IsUUID('4', { message: 'batchId must be a UUID' })
  batchId!: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Amount must be at least ₹1' })
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PayAddonDto {
  @IsIn(PAYMENT_MODES as unknown as string[], { message: 'Unsupported payment mode' })
  paymentMode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class WaiveAddonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** One add-on charged to one student (as opposed to a whole batch). */
export class StudentAddonDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Amount must be at least ₹1' })
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsIn(['PRESCHOOL', 'EVENING'], { message: 'Unknown ledger' })
  ledgerType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

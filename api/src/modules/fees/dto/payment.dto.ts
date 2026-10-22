import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'UPI', 'POS', 'RAZORPAY', 'NEFT'] as const;
export const LEDGER_TYPES = ['PRESCHOOL', 'EVENING'] as const;

export class CreatePaymentDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  /** Amount collected, in rupees. Must be positive. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Amount must be at least ₹1' })
  @Max(10_000_000)
  amount!: number;

  @IsIn(PAYMENT_MODES, { message: 'Unsupported payment mode' })
  paymentMode!: (typeof PAYMENT_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  instalmentNo?: number;

  /** Dual ledger rule: preschool and evening are never merged. */
  @IsOptional()
  @IsIn(LEDGER_TYPES)
  ledgerType?: (typeof LEDGER_TYPES)[number];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  discount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  fine?: number;

  @IsOptional()
  @IsISO8601()
  paymentDate?: string;
}

export class CancelReceiptDto {
  /** Cancellation is audited; a reason is mandatory. */
  @IsString()
  @MaxLength(500)
  reason!: string;
}

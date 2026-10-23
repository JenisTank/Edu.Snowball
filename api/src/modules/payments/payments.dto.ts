import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const LEDGERS = ['PRESCHOOL', 'EVENING'] as const;

/**
 * A UPI intent. `amount` is optional: omitting it means "the whole outstanding
 * balance", which is what a parent taps in a hurry. When supplied it is checked
 * against the balance, so a hand-typed amount cannot overpay.
 */
export class CreateUpiIntentDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a rupee figure with at most 2 decimals' },
  )
  @Min(1, { message: 'amount must be at least ₹1' })
  @Max(100000, { message: 'a single UPI payment is limited to ₹1,00,000' })
  amount?: number;

  @IsOptional()
  @IsIn(LEDGERS)
  ledgerType?: (typeof LEDGERS)[number];
}

/** The parent's claim: the UTR / UPI reference from their payment app. */
export class ClaimUpiPaymentDto {
  @IsString()
  @MaxLength(32)
  payerRef!: string;
}

/** The desk confirming or rejecting a claim. */
export class ConfirmUpiPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  payerRef?: string;
}

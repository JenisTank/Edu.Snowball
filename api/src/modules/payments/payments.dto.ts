import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const LEDGERS = ['PRESCHOOL', 'EVENING'] as const;

export class CreateOnlineOrderDto {
  @IsUUID('4', { message: 'studentId must be a UUID' })
  studentId!: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a rupee figure with at most 2 decimals' },
  )
  @Min(1, { message: 'amount must be at least ₹1' })
  @Max(200000, { message: 'amount exceeds the online payment limit' })
  amount!: number;

  @IsOptional()
  @IsIn(LEDGERS)
  ledgerType?: (typeof LEDGERS)[number];
}

export class VerifyOnlinePaymentDto {
  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}

import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const PURPOSES = [
  'PARENT_VISIT',
  'ADMISSION_ENQUIRY',
  'VENDOR',
  'INTERVIEW',
  'OFFICIAL',
  'OTHER',
] as const;

const DEPOSIT_HOLDERS = ['EMPLOYEE', 'STUDENT'] as const;
const DEPOSIT_ENDINGS = ['RETURNED', 'FORFEITED'] as const;

/**
 * A security deposit is collected from a staff member (or, rarely, held for a
 * child's breakage). Exactly one holder must be named — the controller rejects
 * both or neither, because a deposit with no holder is money with no owner.
 */
export class CreateSecurityDepositDto {
  @IsIn(DEPOSIT_HOLDERS)
  holder!: (typeof DEPOSIT_HOLDERS)[number];

  @IsUUID('4')
  holderId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CloseSecurityDepositDto {
  @IsIn(DEPOSIT_ENDINGS)
  outcome!: (typeof DEPOSIT_ENDINGS)[number];

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;
}

export class CreateGuestLogDto {
  @IsString()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[+0-9][0-9\s-]{5,19}$/, { message: 'phone must be a dialable number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  organisation?: string;

  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  badgeNo?: string;

  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CheckOutGuestDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

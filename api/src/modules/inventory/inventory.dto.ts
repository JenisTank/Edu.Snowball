import { Type } from 'class-transformer';
import { IO_CATEGORIES, IO_DIRECTIONS, PETTY_CASH_TYPES } from './procurement.rules';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Inventory and procurement payloads.
 *
 * Quantities are integers (you cannot issue half a crayon box), money is a
 * decimal, and every `unitId` is optional because Head Office users choose the
 * unit while unit-scoped staff inherit their own.
 */

export const MOVEMENT_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const;
// Re-exported so a DTO and the controller validate against the same list.
export { IO_CATEGORIES, IO_DIRECTIONS, PETTY_CASH_TYPES } from './procurement.rules';

export class CreateInventoryItemDto {
  @IsString()
  @MaxLength(40)
  sku!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(40)
  category!: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}

export class OpeningStockLineDto {
  @IsUUID('4')
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
}

export class OpeningStockDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => OpeningStockLineDto)
  items!: OpeningStockLineDto[];
}

export class StockMovementDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsIn(MOVEMENT_TYPES as unknown as string[])
  type!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class IssueToStudentDto {
  @IsUUID('4')
  studentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsBoolean()
  bill?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class InwardOutwardDto {
  @IsIn(IO_DIRECTIONS as unknown as string[])
  direction!: string;

  @IsIn(IO_CATEGORIES as unknown as string[])
  category!: string;

  @IsString()
  @MaxLength(160)
  party!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ────────────────────────── procurement ──────────────────────────

export class CreateVendorDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsBoolean()
  preApproved?: boolean;
}

export class UpdateVendorDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string | null;

  @IsOptional()
  @IsBoolean()
  preApproved?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PurchaseLineDto {
  @IsOptional()
  @IsUUID('4')
  itemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsUUID('4')
  orderLineId?: string;
}

export class CreatePurchaseRequestDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justification?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one line is required' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsUUID('4', { message: 'vendorId must be a UUID' })
  vendorId!: string;

  @IsOptional()
  @IsUUID('4')
  requestId?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** Reason for raising a PO against an unapproved request. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines?: PurchaseLineDto[];
}

export class ReceiveGoodsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one received line is required' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNo?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  /** Vendor invoice date (date only); drives the purchase register. */
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PettyCashDto {
  @IsOptional()
  @IsUUID('4')
  unitId?: string;

  @IsIn(PETTY_CASH_TYPES as unknown as string[])
  type!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptRef?: string;
}

export class RequestNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectRequestDto {
  @IsString()
  @MaxLength(500)
  note!: string;
}

export class CancelOrderDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

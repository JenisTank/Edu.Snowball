import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Request bodies for CRM: the routing-area master and First Buzz Leads.
 *
 * Form A (hub/remote) is routed from the locality; Form B (walk-in) is
 * auto-assigned to the receiving unit. Both share the same DTO because keeping
 * one shape means the frontend cannot drift between the two forms.
 */

export const FORM_VERSIONS = ['A', 'B'] as const;
export const INQUIRY_CHANNELS = [
  'CALL',
  'WALK_IN',
  'WHATSAPP',
  'WEBSITE',
  'REFERRAL',
  'EVENT',
] as const;
export const PREFERRED_UNITS = ['U1', 'U2', 'U3', 'NO_PREFERENCE'] as const;

export class CreateAreaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  locality!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @IsUUID('4')
  suggestedUnitId!: string;
}

export class UpdateAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @IsOptional()
  @IsUUID('4')
  suggestedUnitId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLeadDto {
  @IsOptional()
  @IsIn(FORM_VERSIONS as unknown as string[])
  formVersion?: 'A' | 'B';

  @IsString()
  @IsNotEmpty({ message: 'Parent name is required' })
  @MaxLength(120)
  parentName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Parent phone is required' })
  @MaxLength(20)
  parentPhone!: string;

  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  childName?: string;

  @IsOptional()
  @IsDateString()
  childDob?: string;

  @IsOptional()
  @IsUUID('4')
  programmeInterestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaLocality?: string;

  @IsOptional()
  @IsIn(PREFERRED_UNITS as unknown as string[])
  preferredUnit?: string;

  @IsOptional()
  @IsIn(INQUIRY_CHANNELS as unknown as string[])
  inquiryChannel?: string;

  @IsOptional()
  @IsBoolean()
  experienceInterest?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Form B only: the unit the family walked into. */
  @IsOptional()
  @IsUUID('4')
  walkInUnitId?: string;
}

export class SetLeadStageDto {
  @IsString()
  @IsNotEmpty()
  stage!: string;

  /** Required when marking a lead LOST — the reason is the audit trail. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignLeadDto {
  @IsUUID('4')
  unitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AddLeadNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Note is required' })
  @MaxLength(4000)
  note!: string;
}

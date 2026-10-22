import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Parent-portal write payloads: messages to the centre, leave applications and
 * DPDP consent decisions. The parent can only ever act on their own child — the
 * controller checks `guardChild` before it reads any of this.
 */

export class ParentMessageDto {
  @IsString()
  @MaxLength(1000, { message: 'Message must be 1000 characters or fewer' })
  body!: string;
}

export const PARENT_LEAVE_TYPES = ['SICK', 'TRAVEL', 'FAMILY', 'OTHER'] as const;

export class ParentLeaveDto {
  @IsDateString({}, { message: 'fromDate must be an ISO date' })
  fromDate!: string;

  @IsDateString({}, { message: 'toDate must be an ISO date' })
  toDate!: string;

  @IsOptional()
  @IsIn(PARENT_LEAVE_TYPES as unknown as string[])
  type?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ParentConsentDto {
  /** consentType → granted. Unknown types are ignored by the privacy rules. */
  @Type(() => Object)
  @IsObject()
  decisions!: Record<string, boolean>;
}

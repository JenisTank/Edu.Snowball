import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

/**
 * Web-push subscription, exactly as `PushManager.subscribe()` returns it.
 * The endpoint is a URL for a push service (FCM/Mozilla), and the two keys are
 * base64url secrets — none of which should ever be logged.
 */
export class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth!: string;
}

export class PushSubscriptionDto {
  @IsUrl({ require_tld: false }, { message: 'endpoint must be a URL' })
  @MaxLength(1000)
  endpoint!: string;

  @Type(() => PushKeysDto)
  @ValidateNested()
  keys!: PushKeysDto;
}

export class UnsubscribeDto {
  @IsUrl({ require_tld: false }, { message: 'endpoint must be a URL' })
  @MaxLength(1000)
  endpoint!: string;
}

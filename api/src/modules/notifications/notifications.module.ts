import { Global, Module } from '@nestjs/common';

import { PushService } from './push.service';

/** Web-push fan-out used by comms, fee reminders and the parent portal. */
@Global()
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class NotificationsModule {}

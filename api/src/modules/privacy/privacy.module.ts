import { Module } from '@nestjs/common';

import { PrivacyController } from './privacy.controller';

/** DPDP: consent register, retention, access and erasure. */
@Module({ controllers: [PrivacyController] })
export class PrivacyModule {}

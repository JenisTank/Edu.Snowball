import { Module } from '@nestjs/common';

import { CertificatesController } from './certificates.controller';

/** HO-locked certificate templates, serial numbers and print layouts. */
@Module({ controllers: [CertificatesController] })
export class CertificatesModule {}

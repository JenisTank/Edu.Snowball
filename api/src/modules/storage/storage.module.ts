import { Module } from '@nestjs/common';

import { StudentDocumentsController } from './documents.controller';

/** Per-student document storage (local volume or S3). */
@Module({ controllers: [StudentDocumentsController] })
export class StorageModule {}

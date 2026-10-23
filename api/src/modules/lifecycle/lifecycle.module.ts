import { Module } from '@nestjs/common';

import { LifecycleController } from './lifecycle.controller';

/** Student lifecycle records across the 18 profile tabs. */
@Module({ controllers: [LifecycleController] })
export class LifecycleModule {}

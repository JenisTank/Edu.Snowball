import { Module } from '@nestjs/common';

import { ThemeController } from './theme.controller';

/** Global UI theme default (Snowball design system). */
@Module({ controllers: [ThemeController] })
export class ThemeModule {}

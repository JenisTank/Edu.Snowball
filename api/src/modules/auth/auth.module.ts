import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthGuard } from '../../common/auth/auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * JWT authentication (15-min access token + 7-day refresh).
 * Global so `@UseGuards(AuthGuard)` works in every feature module.
 */
@Global()
@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard, JwtModule],
})
export class AuthModule {}

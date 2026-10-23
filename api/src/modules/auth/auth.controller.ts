import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../../common/auth/auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';

// ───────── Controller ─────────
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** 5 attempts per minute per IP — brute-force protection on the staff door. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Req() req: any, @Body() body: LoginDto) {
    return this.auth.login(body.email, body.password, req);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}

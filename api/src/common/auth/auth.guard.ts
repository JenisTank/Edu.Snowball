import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/auth.constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';

// ───────── JWT Auth Guard ─────────
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    // Accept token from any of 3 channels — proxies/iframes may strip some:
    // 1. custom header  2. standard Authorization  3. cookie
    let token = (req.headers['x-bb-token'] as string) || '';
    if (!token) token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token && req.headers.cookie) {
      const m = /(?:^|;\s*)bb_token=([^;]+)/.exec(req.headers.cookie);
      if (m) token = decodeURIComponent(m[1]);
    }
    if (!token) throw new UnauthorizedException('No token');
    try {
      req.user = await this.jwt.verifyAsync(token, { secret: env.jwtSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !required.includes(req.user.role))
      throw new UnauthorizedException('Insufficient role');
    return true;
  }
}

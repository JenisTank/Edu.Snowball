import {
  Body, Controller, Get, Injectable, Module, Post, Req, UnauthorizedException,
  CanActivate, ExecutionContext, UseGuards, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

// ───────── Roles decorator ─────────
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// HO-level roles see across all units
export const HO_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CURRICULUM_LEAD', 'RECEPTIONIST'];

// ───────── JWT Auth Guard ─────────
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

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
      req.user = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required && !required.includes(req.user.role)) throw new UnauthorizedException('Insufficient role');
    return true;
  }
}

// Helper: unit scope filter — HO roles see all; unit roles see own unit only
export function unitScope(user: { role: string; unitId: string | null }, requestedUnitId?: string) {
  if (HO_ROLES.includes(user.role)) {
    return requestedUnitId ? { unitId: requestedUnitId } : {};
  }
  return { unitId: user.unitId ?? '__none__' };
}

// ───────── Service ─────────
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private async issueTokens(user: any) {
    const payload = { sub: user.id, email: user.email, name: user.fullName, role: user.role, unitId: user.unitId };
    return {
      // Spec: 15-min access token + 7-day refresh token
      accessToken: await this.jwt.signAsync(payload, { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES || '15m' }),
      refreshToken: await this.jwt.signAsync({ sub: user.id, typ: 'refresh' }, { secret: process.env.JWT_SECRET, expiresIn: '7d' }),
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, unitId: user.unitId, unitName: user.unit?.name ?? 'Head Office' },
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { unit: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const p: any = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_SECRET });
      if (p.typ !== 'refresh') throw new Error('not a refresh token');
      const user = await this.prisma.user.findUnique({ where: { id: p.sub }, include: { unit: true } });
      if (!user || !user.isActive) throw new Error('user inactive');
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Session expired — please log in again');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { unit: true } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, unitId: user.unitId, unitName: user.unit?.name ?? 'Head Office' };
  }
}

// ───────── Controller ─────────
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}

// ───────── Module ─────────
@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuthGuard],
  exports: [AuthService],
})
export class AuthModule {}

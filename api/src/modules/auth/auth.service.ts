import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuditService } from '../../common/audit/audit.service';
import { verifyPassword } from '../../common/auth/password';
import { PrismaService } from '../../common/database/prisma.service';
import { env } from '../../config/env';

// ───────── Service ─────────
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private async issueTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      unitId: user.unitId,
    };
    return {
      // Spec: 15-min access token + 7-day refresh token
      accessToken: await this.jwt.signAsync(payload, {
        secret: env.jwtSecret,
        expiresIn: env.jwtExpiresIn,
      }),
      refreshToken: await this.jwt.signAsync(
        { sub: user.id, typ: 'refresh' },
        { secret: env.jwtSecret, expiresIn: '7d' },
      ),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        unitId: user.unitId,
        unitName: user.unit?.name ?? 'Head Office',
      },
    };
  }

  /**
   * Failed attempts are written to the audit log (email + IP, never the
   * password) so repeated failures are visible to the Founder.
   */
  private async recordFailedLogin(email: string, reason: string, req?: any) {
    try {
      await this.audit.log(req ?? {}, 'auth_login', email.toLowerCase(), 'INSERT', null, {
        event: 'LOGIN_FAILED',
        email: email.toLowerCase(),
        reason,
      });
    } catch {
      /* auditing must never break the login flow */
    }
  }

  async login(email: string, password: string, req?: any) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { unit: true } });
    if (!user) {
      await this.recordFailedLogin(email, 'UNKNOWN_EMAIL', req);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      await this.recordFailedLogin(email, 'INACTIVE_USER', req);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await this.recordFailedLogin(email, 'WRONG_PASSWORD', req);
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const p: any = await this.jwt.verifyAsync(refreshToken, { secret: env.jwtSecret });
      if (p.typ !== 'refresh') throw new Error('not a refresh token');
      const user = await this.prisma.user.findUnique({
        where: { id: p.sub },
        include: { unit: true },
      });
      if (!user || !user.isActive) throw new Error('user inactive');
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Session expired — please log in again');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { unit: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      unitId: user.unitId,
      unitName: user.unit?.name ?? 'Head Office',
    };
  }
}

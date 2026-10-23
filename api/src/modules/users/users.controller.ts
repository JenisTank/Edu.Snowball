import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ADMIN_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { HEAD_OFFICE_USER_ROLES, UNIT_MANAGED_ROLES } from './user.constants';
import { ChangePasswordDto, CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { hashPassword, verifyPassword } from '../../common/auth/password';

// ─────────────────────────── USERS (team management) ───────────────────────────
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertCanManage(actor: any, target: { role: string; unitId: string | null }) {
    if (ADMIN_ROLES.includes(actor.role)) return; // Founder/AD manage everyone
    if (actor.role === 'CENTRE_HEAD') {
      // CH may only manage unit-level staff of their own unit
      if (!UNIT_MANAGED_ROLES.includes(target.role))
        throw new ForbiddenException(
          'Centre Heads can only manage coordinators, teachers and receptionists',
        );
      if (target.unitId !== actor.unitId) throw new ForbiddenException('Cross-unit access denied');
      return;
    }
    throw new ForbiddenException('Insufficient role');
  }

  @Get()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async list(@Req() req: any, @Query('unitId') unitId?: string) {
    const where: any = ADMIN_ROLES.includes(req.user.role)
      ? unitId
        ? { unitId }
        : {}
      : { unitId: req.user.unitId ?? '__none__' };
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        unitId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        unit: { select: { code: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return users;
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async create(@Req() req: any, @Body() body: CreateUserDto) {
    const { email, fullName, phone, role, unitId, password } = body;
    if (!email || !fullName || !role || !password)
      throw new BadRequestException('email, fullName, role and password are required');
    if (password.length < 8)
      throw new BadRequestException('Password must be at least 8 characters');
    const unitIdFinal = HEAD_OFFICE_USER_ROLES.includes(role) ? unitId || null : (unitId ?? null);
    if (!HEAD_OFFICE_USER_ROLES.includes(role) && !unitIdFinal)
      throw new BadRequestException('Unit is required for unit-level roles');
    this.assertCanManage(req.user, { role, unitId: unitIdFinal });

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists)
      throw new BadRequestException(
        'A user with this email already exists (one login per person — DPDP rule)',
      );

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName,
        phone: phone || null,
        role,
        unitId: unitIdFinal,
        passwordHash: await hashPassword(password),
      },
    });
    await this.audit.log(req, 'users', user.id, 'INSERT', null, {
      email,
      fullName,
      role,
      unitId: unitIdFinal,
    });
    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    this.assertCanManage(req.user, existing);
    if (existing.role === 'FOUNDER' && req.user.role !== 'FOUNDER')
      throw new ForbiddenException('Only the Founder account can modify itself');

    const data: any = {};
    for (const k of ['fullName', 'phone', 'role', 'unitId', 'isActive'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (data.role && !ADMIN_ROLES.includes(req.user.role))
      this.assertCanManage(req.user, { role: data.role, unitId: data.unitId ?? existing.unitId });
    if (data.role && HEAD_OFFICE_USER_ROLES.includes(data.role)) data.unitId = body.unitId ?? null;

    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.audit.log(req, 'users', id, 'UPDATE', existing, updated);
    const { passwordHash, ...safe } = updated as any;
    return safe;
  }

  @Post(':id/reset-password')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async resetPassword(@Req() req: any, @Param('id') id: string, @Body() body: ResetPasswordDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    this.assertCanManage(req.user, existing);
    if (!body.newPassword || body.newPassword.length < 8)
      throw new BadRequestException('Password must be at least 8 characters');
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    await this.audit.log(req, 'users', id, 'UPDATE', null, {
      passwordReset: true,
      by: req.user.email,
    });
    return { ok: true };
  }

  @Post('me/password')
  async changeOwnPassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    const me = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!me) throw new NotFoundException();
    if (!(await verifyPassword(body.currentPassword || '', me.passwordHash)))
      throw new BadRequestException('Current password is incorrect');
    if (!body.newPassword || body.newPassword.length < 8)
      throw new BadRequestException('New password must be at least 8 characters');
    await this.prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    await this.audit.log(req, 'users', me.id, 'UPDATE', null, { passwordChanged: 'self' });
    return { ok: true };
  }
}

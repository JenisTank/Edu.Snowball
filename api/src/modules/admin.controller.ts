import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query, Req,
  UseGuards, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';

const ADMIN_ROLES = ['FOUNDER', 'ACADEMIC_DIR'];
const UNIT_MANAGED_ROLES = ['COORDINATOR', 'TEACHER', 'RECEPTIONIST']; // roles a Centre Head may manage

// CREATE is accepted as an alias of INSERT — both spellings exist in the
// codebase and mean the same thing in the audit trail.
export type AuditAction = 'INSERT' | 'CREATE' | 'UPDATE' | 'DELETE';

// ─────────────────────────── AUDIT SERVICE (Rule 3: every mutation logged) ───────────────────────────
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(req: any, tableName: string, recordId: string, action: AuditAction, oldData: any, newData: any) {
    const scrub = (o: any) => {
      if (!o) return o;
      const c = { ...o };
      delete c.passwordHash; // never persist hashes in audit trail
      return c;
    };
    await this.prisma.auditLog.create({
      data: {
        tableName, recordId, action,
        oldData: scrub(oldData) ?? undefined,
        newData: scrub(newData) ?? undefined,
        changedById: req.user?.sub ?? null,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
      },
    });
  }
}

// ─────────────────────────── USERS (team management) ───────────────────────────
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertCanManage(actor: any, target: { role: string; unitId: string | null }) {
    if (ADMIN_ROLES.includes(actor.role)) return; // Founder/AD manage everyone
    if (actor.role === 'CENTRE_HEAD') {
      // CH may only manage unit-level staff of their own unit
      if (!UNIT_MANAGED_ROLES.includes(target.role)) throw new ForbiddenException('Centre Heads can only manage coordinators, teachers and receptionists');
      if (target.unitId !== actor.unitId) throw new ForbiddenException('Cross-unit access denied');
      return;
    }
    throw new ForbiddenException('Insufficient role');
  }

  @Get()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async list(@Req() req: any, @Query('unitId') unitId?: string) {
    const where: any = ADMIN_ROLES.includes(req.user.role)
      ? (unitId ? { unitId } : {})
      : { unitId: req.user.unitId ?? '__none__' };
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true, email: true, fullName: true, phone: true, role: true,
        unitId: true, isActive: true, lastLoginAt: true, createdAt: true,
        unit: { select: { code: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return users;
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async create(@Req() req: any, @Body() body: any) {
    const { email, fullName, phone, role, unitId, password } = body;
    if (!email || !fullName || !role || !password) throw new BadRequestException('email, fullName, role and password are required');
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const unitIdFinal = HO_ROLES.includes(role) ? (unitId || null) : unitId;
    if (!HO_ROLES.includes(role) && !unitIdFinal) throw new BadRequestException('Unit is required for unit-level roles');
    this.assertCanManage(req.user, { role, unitId: unitIdFinal });

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('A user with this email already exists (one login per person — DPDP rule)');

    const user = await this.prisma.user.create({
      data: { email, fullName, phone: phone || null, role, unitId: unitIdFinal, passwordHash: await bcrypt.hash(password, 10) },
    });
    await this.audit.log(req, 'users', user.id, 'INSERT', null, { email, fullName, role, unitId: unitIdFinal });
    const { passwordHash, ...safe } = user as any;
    return safe;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    this.assertCanManage(req.user, existing);
    if (existing.role === 'FOUNDER' && req.user.role !== 'FOUNDER') throw new ForbiddenException('Only the Founder account can modify itself');

    const data: any = {};
    for (const k of ['fullName', 'phone', 'role', 'unitId', 'isActive'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (data.role && !ADMIN_ROLES.includes(req.user.role)) this.assertCanManage(req.user, { role: data.role, unitId: data.unitId ?? existing.unitId });
    if (data.role && HO_ROLES.includes(data.role)) data.unitId = body.unitId ?? null;

    const updated = await this.prisma.user.update({ where: { id }, data });
    await this.audit.log(req, 'users', id, 'UPDATE', existing, updated);
    const { passwordHash, ...safe } = updated as any;
    return safe;
  }

  @Post(':id/reset-password')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async resetPassword(@Req() req: any, @Param('id') id: string, @Body() body: { newPassword: string }) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    this.assertCanManage(req.user, existing);
    if (!body.newPassword || body.newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await this.audit.log(req, 'users', id, 'UPDATE', null, { passwordReset: true, by: req.user.email });
    return { ok: true };
  }

  @Post('me/password')
  async changeOwnPassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    const me = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!me) throw new NotFoundException();
    if (!(await bcrypt.compare(body.currentPassword || '', me.passwordHash))) throw new BadRequestException('Current password is incorrect');
    if (!body.newPassword || body.newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    await this.prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    await this.audit.log(req, 'users', me.id, 'UPDATE', null, { passwordChanged: 'self' });
    return { ok: true };
  }
}

// ─────────────────────────── UNIT SETTINGS (HO-locked masters — Rule 6) ───────────────────────────
@Controller('units')
@UseGuards(AuthGuard)
export class UnitsAdminController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async updateUnit(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const existing = await this.prisma.unit.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Unit not found');
    const data: any = {};
    for (const k of ['name', 'address', 'phone', 'email', 'website', 'status'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const updated = await this.prisma.unit.update({ where: { id }, data });
    await this.audit.log(req, 'units', id, 'UPDATE', existing, updated);
    return updated;
  }

  @Patch(':id/settings')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async updateSettings(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { settings: true } });
    if (!unit) throw new NotFoundException('Unit not found');
    // Petty cash float: Founder-only (HO-locked financial master)
    if (body.pettyCashFloat !== undefined && req.user.role !== 'FOUNDER') {
      throw new ForbiddenException('Petty cash float is Founder-locked');
    }
    const data: any = {};
    for (const k of ['pettyCashFloat', 'admissionNumber', 'calendlyLink'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const updated = await this.prisma.unitSettings.upsert({
      where: { unitId: id },
      update: data,
      create: { unitId: id, ...data },
    });
    await this.audit.log(req, 'unit_settings', id, 'UPDATE', unit.settings, updated);
    return updated;
  }
}

// ─────────────────────────── BATCH MASTERS (timings drive attendance locks — Rule 5) ───────────────────────────
@Controller('batches')
@UseGuards(AuthGuard)
export class BatchesAdminController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertUnitAllowed(actor: any, unitId: string) {
    if (ADMIN_ROLES.includes(actor.role)) return;
    if (actor.role === 'CENTRE_HEAD' && actor.unitId === unitId) return;
    throw new ForbiddenException('You can only manage batches of your own unit');
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async create(@Req() req: any, @Body() body: any) {
    const { unitId, programmeId, name, medium, shift, startTime, endTime, capacity, academicYear } = body;
    if (!unitId || !programmeId || !name || !shift || !startTime || !capacity) {
      throw new BadRequestException('unitId, programmeId, name, shift, startTime and capacity are required');
    }
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new BadRequestException('startTime must be HH:MM (drives the attendance lock — Rule 5)');
    this.assertUnitAllowed(req.user, unitId);
    const batch = await this.prisma.batch.create({
      data: {
        unitId, programmeId, name, medium: medium || null, shift, startTime,
        endTime: endTime || null, capacity: Number(capacity),
        academicYear: academicYear || '2026-27',
      },
      include: { programme: true, unit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'batches', batch.id, 'INSERT', null, body);
    return batch;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const existing = await this.prisma.batch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Batch not found');
    this.assertUnitAllowed(req.user, existing.unitId);
    if (body.startTime && !/^\d{2}:\d{2}$/.test(body.startTime)) throw new BadRequestException('startTime must be HH:MM');
    const data: any = {};
    for (const k of ['name', 'medium', 'shift', 'startTime', 'endTime', 'capacity', 'academicYear', 'isActive', 'programmeId'] as const) {
      if (body[k] !== undefined) data[k] = k === 'capacity' ? Number(body[k]) : body[k];
    }
    const updated = await this.prisma.batch.update({
      where: { id }, data,
      include: { programme: true, unit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'batches', id, 'UPDATE', existing, updated);
    return updated;
  }
}

// ─────────────────────────── AUDIT LOG (read — Founder/AD only) ───────────────────────────
@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  list(@Query('limit') limit?: string) {
    return this.prisma.auditLog.findMany({
      take: Math.min(Number(limit) || 200, 500),
      orderBy: { changedAt: 'desc' },
      include: { changedBy: { select: { fullName: true, email: true, role: true } } },
    });
  }
}

// ─────────────────────────── MODULE ───────────────────────────
@Module({
  controllers: [UsersController, UnitsAdminController, BatchesAdminController, AuditController],
  providers: [PrismaService, AuditService],
})
export class AdminModule {}

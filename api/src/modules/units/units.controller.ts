import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { UpdateUnitDto, UpdateUnitSettingsDto } from './units.dto';

// ─────────────────────────── UNITS ───────────────────────────
@Controller('units')
@UseGuards(AuthGuard)
export class UnitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const where =
      HO_ROLES.includes(req.user.role) || req.user.role === 'HR_MANAGER'
        ? {}
        : { id: req.user.unitId ?? '__none__' };
    return this.prisma.unit.findMany({
      where,
      include: { settings: true, _count: { select: { students: true, batches: true } } },
      orderBy: { code: 'asc' },
    });
  }
}

// ─────────────────────────── UNIT SETTINGS (HO-locked masters — Rule 6) ───────────────────────────
@Controller('units')
@UseGuards(AuthGuard)
export class UnitsAdminController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async updateUnit(@Req() req: any, @Param('id') id: string, @Body() body: UpdateUnitDto) {
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
  async updateSettings(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateUnitSettingsDto,
  ) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { settings: true } });
    if (!unit) throw new NotFoundException('Unit not found');
    // Petty cash float: Founder-only (HO-locked financial master)
    if (body.pettyCashFloat !== undefined && req.user.role !== 'FOUNDER') {
      throw new ForbiddenException('Petty cash float is Founder-locked');
    }
    const data: any = {};
    for (const k of [
      'pettyCashFloat',
      'admissionNumber',
      'phone',
      'upiVpa',
      'upiPayeeName',
      'ptEnabled',
    ] as const) {
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

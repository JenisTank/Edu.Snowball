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
import { unitScope } from '../../common/auth/unit-scope';
import { ADMIN_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateBatchDto, UpdateBatchDto } from './units.dto';

// ─────────────────────────── BATCHES ───────────────────────────
@Controller('batches')
@UseGuards(AuthGuard)
export class BatchesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.batch.findMany({
      where: unitScope(req.user, unitId),
      include: {
        programme: true,
        unit: { select: { code: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: [{ unitId: 'asc' }, { name: 'asc' }],
    });
  }
}

// ─────────────────────────── BATCH MASTERS (timings drive attendance locks — Rule 5) ───────────────────────────
@Controller('batches')
@UseGuards(AuthGuard)
export class BatchesAdminController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertUnitAllowed(actor: any, unitId: string) {
    if (ADMIN_ROLES.includes(actor.role)) return;
    if (actor.role === 'CENTRE_HEAD' && actor.unitId === unitId) return;
    throw new ForbiddenException('You can only manage batches of your own unit');
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async create(@Req() req: any, @Body() body: CreateBatchDto) {
    const { unitId, programmeId, name, medium, shift, startTime, endTime, capacity, academicYear } =
      body;
    if (!unitId || !programmeId || !name || !shift || !startTime || !capacity) {
      throw new BadRequestException(
        'unitId, programmeId, name, shift, startTime and capacity are required',
      );
    }
    if (!/^\d{2}:\d{2}$/.test(startTime))
      throw new BadRequestException(
        'startTime must be HH:MM (drives the attendance lock — Rule 5)',
      );
    this.assertUnitAllowed(req.user, unitId);
    const batch = await this.prisma.batch.create({
      data: {
        unitId,
        programmeId,
        name,
        medium: medium || null,
        shift,
        startTime,
        endTime: endTime || null,
        capacity: Number(capacity),
        academicYear: academicYear || '2026-27',
      },
      include: { programme: true, unit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'batches', batch.id, 'INSERT', null, body);
    return batch;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateBatchDto) {
    const existing = await this.prisma.batch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Batch not found');
    this.assertUnitAllowed(req.user, existing.unitId);
    if (body.startTime && !/^\d{2}:\d{2}$/.test(body.startTime))
      throw new BadRequestException('startTime must be HH:MM');
    const data: any = {};
    for (const k of [
      'name',
      'medium',
      'shift',
      'startTime',
      'endTime',
      'capacity',
      'academicYear',
      'isActive',
      'programmeId',
    ] as const) {
      if (body[k] !== undefined) data[k] = k === 'capacity' ? Number(body[k]) : body[k];
    }
    const updated = await this.prisma.batch.update({
      where: { id },
      data,
      include: { programme: true, unit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'batches', id, 'UPDATE', existing, updated);
    return updated;
  }
}

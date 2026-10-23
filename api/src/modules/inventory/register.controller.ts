import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { unitScope } from '../../common/auth/unit-scope';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IO_CATEGORIES, IO_DIRECTIONS } from './procurement.rules';
import { InwardOutwardDto } from './inventory.dto';

/**
 * Inward / Outward register (spec module 16).
 *
 * Not stock — this is the gate book: couriers, documents, keys, repairs and
 * visitors. Every franchise audit asks for it, and it is the record that proves
 * a laptop left the building with whom and when.
 */

const ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];

@Controller('register')
@UseGuards(AuthGuard)
export class InwardOutwardController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  @Roles(...ROLES)
  list(
    @Req() req: any,
    @Query('direction') direction?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.prisma.inwardOutwardEntry.findMany({
      where: {
        ...unitScope(req.user, unitId),
        ...(direction ? { direction } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  @Post()
  @Roles(...ROLES)
  async create(@Req() req: any, @Body() b: InwardOutwardDto) {
    if (!(IO_DIRECTIONS as readonly string[]).includes(b.direction))
      throw new BadRequestException(`Direction must be one of ${IO_DIRECTIONS.join(', ')}`);
    if (!(IO_CATEGORIES as readonly string[]).includes(b.category))
      throw new BadRequestException(`Category must be one of ${IO_CATEGORIES.join(', ')}`);
    if (!b.party?.trim() || !b.description?.trim())
      throw new BadRequestException('Party and description are required');
    const unitId = HO_ROLES.includes(req.user.role)
      ? (b.unitId ?? req.user.unitId)
      : req.user.unitId;
    if (!unitId) throw new BadRequestException('unitId is required for a Head Office user');

    const row = await this.prisma.inwardOutwardEntry.create({
      data: {
        unitId,
        direction: b.direction,
        date: b.date
          ? new Date(`${b.date}T00:00:00Z`)
          : new Date(new Date().toISOString().slice(0, 10)),
        category: b.category,
        party: b.party.trim(),
        description: b.description.trim(),
        reference: b.reference?.trim() || null,
        handledById: req.user.sub,
        // An outward entry needs a signature; an inward one is acknowledged on receipt.
        acknowledged: false,
      },
    });
    await this.audit.log(req, 'inward_outward_entries', row.id, 'INSERT', null, row);
    return row;
  }

  @Post(':id/acknowledge')
  @Roles(...ROLES)
  async acknowledge(@Req() req: any, @Param('id') id: string) {
    const row = await this.prisma.inwardOutwardEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Entry not found');
    if (!HO_ROLES.includes(req.user.role) && row.unitId !== req.user.unitId)
      throw new BadRequestException('Entry is outside your unit');
    const updated = await this.prisma.inwardOutwardEntry.update({
      where: { id },
      data: { acknowledged: true },
    });
    await this.audit.log(
      req,
      'inward_outward_entries',
      id,
      'UPDATE',
      { acknowledged: false },
      {
        acknowledged: true,
      },
    );
    return updated;
  }

  /** Monthly counts by direction and category — the page the auditor asks for. */
  @Get('summary')
  @Roles(...ROLES)
  async summary(@Req() req: any, @Query('month') month?: string, @Query('unitId') unitId?: string) {
    const m = month ?? new Date().toISOString().slice(0, 7);
    const from = new Date(`${m}-01T00:00:00Z`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    to.setUTCDate(0);
    const rows = await this.prisma.inwardOutwardEntry.findMany({
      where: { ...unitScope(req.user, unitId), date: { gte: from, lte: to } },
    });
    const byDirection: Record<string, number> = { INWARD: 0, OUTWARD: 0 };
    const byCategory: Record<string, number> = {};
    let pending = 0;
    for (const r of rows) {
      byDirection[r.direction] = (byDirection[r.direction] ?? 0) + 1;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      if (!r.acknowledged) pending += 1;
    }
    return { month: m, total: rows.length, byDirection, byCategory, pending, rows };
  }
}

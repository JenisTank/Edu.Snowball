import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateAreaDto, UpdateAreaDto } from './crm.dto';

// ─────────────────────────── AREA MASTER (HO-maintained lookup) ───────────────────────────
@Controller('areas')
@UseGuards(AuthGuard)
export class AreasController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.areaMaster.findMany({
      include: { suggestedUnit: { select: { code: true, name: true } } },
      orderBy: { locality: 'asc' },
    });
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async create(@Req() req: any, @Body() body: CreateAreaDto) {
    if (!body.locality || !body.suggestedUnitId)
      throw new BadRequestException('locality and suggestedUnitId are required');
    const area = await this.prisma.areaMaster.create({
      data: {
        locality: body.locality,
        pincode: body.pincode || null,
        suggestedUnitId: body.suggestedUnitId,
      },
      include: { suggestedUnit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'area_master', area.id, 'INSERT', null, body);
    return area;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateAreaDto) {
    const existing = await this.prisma.areaMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Area not found');
    const data: any = {};
    for (const k of ['locality', 'pincode', 'suggestedUnitId', 'isActive'] as const)
      if (body[k] !== undefined) data[k] = body[k];
    const updated = await this.prisma.areaMaster.update({
      where: { id },
      data,
      include: { suggestedUnit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'area_master', id, 'UPDATE', existing, updated);
    return updated;
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
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
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

const CATS = [
  'ACADEMIC',
  'ART_CRAFT',
  'OFFICE',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'IT_ELECTRONICS',
  'STUDENT_INVENTORY',
  'SAFETY',
];

@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}
  @Get('categories') cats() {
    return CATS;
  }
  @Get() items(@Req() r: any, @Query('unitId') u?: string) {
    return this.prisma.inventoryItem.findMany({
      where: HO_ROLES.includes(r.user.role)
        ? u
          ? { OR: [{ unitId: u }, { unitId: null }] }
          : {}
        : { OR: [{ unitId: r.user.unitId }, { unitId: null }] },
      orderBy: { name: 'asc' },
    });
  }
  @Post() @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD') async create(
    @Req() r: any,
    @Body() b: any,
  ) {
    if (!b.sku || !b.name || !CATS.includes(b.category))
      throw new BadRequestException('SKU, name and valid category required');
    const unitId = HO_ROLES.includes(r.user.role) ? b.unitId : r.user.unitId;
    const x = await this.prisma.inventoryItem.create({
      data: {
        sku: b.sku.toUpperCase(),
        name: b.name,
        category: b.category,
        unitId: unitId || null,
        reorderLevel: Number(b.reorderLevel || 0),
        unitCost: Number(b.unitCost || 0),
      },
    });
    await this.audit.log(r, 'inventory_items', x.id, 'INSERT', null, x);
    return x;
  }
  @Post(':id/movement') async move(@Req() r: any, @Param('id') id: string, @Body() b: any) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const unitId = b.unitId || r.user.unitId;
    if (!unitId) throw new BadRequestException('Unit required');
    if (!HO_ROLES.includes(r.user.role) && unitId !== r.user.unitId) throw new ForbiddenException();
    const q = Math.abs(Number(b.quantity));
    if (!q || !['RECEIPT', 'ISSUE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(b.type))
      throw new BadRequestException('Valid movement and quantity required');
    const delta = ['ISSUE', 'ADJUSTMENT_OUT'].includes(b.type) ? -q : q;
    if (item.quantity + delta < 0) throw new BadRequestException('Insufficient stock');
    const out = await this.prisma.$transaction(async (tx: any) => {
      await tx.inventoryItem.update({ where: { id }, data: { quantity: { increment: delta } } });
      return tx.inventoryMovement.create({
        data: {
          itemId: id,
          unitId,
          type: b.type,
          quantity: delta,
          unitCost: b.unitCost ? Number(b.unitCost) : null,
          reference: b.reference || null,
          notes: b.notes || null,
          createdById: r.user.sub,
        },
      });
    });
    await this.audit.log(r, 'inventory_movements', out.id, 'INSERT', null, out);
    return out;
  }
}

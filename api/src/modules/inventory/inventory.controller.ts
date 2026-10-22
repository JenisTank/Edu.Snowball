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

  /**
   * Issue stock to a student and (optionally) bill it as an add-on.
   * The movement and the charge are written together: an issued kit that is
   * never billed is exactly the leak the spec's "student issue linked to fee"
   * requirement exists to close.
   */
  @Post(':id/issue-to-student')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'TEACHER')
  async issueToStudent(
    @Req() r: any,
    @Param('id') id: string,
    @Body()
    b: { studentId: string; quantity: number; bill?: boolean; amount?: number; notes?: string },
  ) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    const quantity = Math.abs(Math.round(Number(b.quantity)));
    if (!quantity) throw new BadRequestException('A positive quantity is required');
    const student = await this.prisma.student.findUnique({
      where: { id: b.studentId },
      select: { id: true, unitId: true, status: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(r.user.role) && student.unitId !== r.user.unitId)
      throw new ForbiddenException('Student is outside your unit');
    if (item.quantity < quantity) throw new BadRequestException('Insufficient stock');

    const charge = b.bill === false ? 0 : Number(b.amount ?? quantity * Number(item.unitCost));

    return this.prisma.$transaction(async (tx: any) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          itemId: id,
          unitId: student.unitId,
          type: 'ISSUE',
          quantity: -quantity,
          unitCost: b.bill === false ? null : charge / quantity,
          reference: `STUDENT:${b.studentId}`,
          notes: b.notes?.trim() || `Issued to student`,
          createdById: r.user.sub,
        },
      });
      await tx.inventoryItem.update({ where: { id }, data: { quantity: { decrement: quantity } } });
      const addon =
        charge > 0
          ? await tx.feeAddon.create({
              data: {
                studentId: b.studentId,
                unitId: student.unitId,
                label: `${item.name} × ${quantity}`,
                amount: Math.round(charge),
                notes: `Issued from inventory (${item.sku})`,
                createdById: r.user.sub,
              },
            })
          : null;
      return { movement, addon, billed: addon ? Number(addon.amount) : 0 };
    });
  }
}

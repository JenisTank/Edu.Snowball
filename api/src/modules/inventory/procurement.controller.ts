import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  CancelOrderDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestDto,
  CreateVendorDto,
  PettyCashDto,
  ReceiveGoodsDto,
  RejectRequestDto,
  RequestNoteDto,
  UpdateVendorDto,
} from './inventory.dto';
import type { Response } from 'express';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { unitScope } from '../../common/auth/unit-scope';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { toCsv } from '../fees/reports.rules';
import { ReorderService } from './reorder.service';
import {
  IO_CATEGORIES,
  IO_DIRECTIONS,
  PETTY_CASH_TYPES,
  PROCUREMENT_REPORTS,
  canSpend,
  canTransitionRequest,
  consumptionRows,
  grnNumber,
  lowStockRows,
  nextSerial,
  orderTotal,
  pettyCashBalance,
  poNumber,
  statusAfterReceipt,
  valuationRows,
} from './procurement.rules';

/**
 * Procurement: vendor master, purchase requests, purchase orders, goods
 * receipts, petty cash and the ten inventory reports the spec asks for.
 *
 * The chain is enforced: a PO can only be raised from an APPROVED request (or
 * with an explicit override note), and stock only increases through a GRN.
 */

const BUY_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];
const APPROVE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'];
const AY_SHORT = '2627';

@Controller('procurement')
@UseGuards(AuthGuard)
export class ProcurementController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private reorder: ReorderService,
  ) {}

  private unitFor(req: any, unitId?: string): string {
    const unit = HO_ROLES.includes(req.user.role) ? unitId : req.user.unitId;
    if (!unit) throw new BadRequestException('unitId is required for a Head Office user');
    return unit;
  }

  private async unitCode(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { code: true },
    });
    if (!unit) throw new BadRequestException('Unknown unit');
    return unit.code;
  }

  // ───────────────────────────── vendors ─────────────────────────────
  @Get('vendors')
  @Roles(...BUY_ROLES)
  vendors(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.vendor.findMany({
      where: HO_ROLES.includes(req.user.role)
        ? unitId
          ? { OR: [{ unitId }, { unitId: null }] }
          : {}
        : { OR: [{ unitId: req.user.unitId }, { unitId: null }] },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  @Post('vendors')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async createVendor(@Req() req: any, @Body() b: CreateVendorDto) {
    if (!b.name?.trim() || !b.code?.trim())
      throw new BadRequestException('Name and code are required');
    const unitId = HO_ROLES.includes(req.user.role) ? (b.unitId ?? null) : req.user.unitId;
    const row = await this.prisma.vendor.create({
      data: {
        unitId,
        code: String(b.code).trim().toUpperCase(),
        name: String(b.name).trim(),
        category: b.category || null,
        contactName: b.contactName || null,
        phone: b.phone || null,
        email: b.email || null,
        gstin: b.gstin || null,
        address: b.address || null,
        preApproved: !!b.preApproved,
      },
    });
    await this.audit.log(req, 'vendors', row.id, 'INSERT', null, row);
    return row;
  }

  @Patch('vendors/:id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async updateVendor(@Req() req: any, @Param('id') id: string, @Body() b: UpdateVendorDto) {
    const old = await this.prisma.vendor.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Vendor not found');
    if (!HO_ROLES.includes(req.user.role) && old.unitId !== req.user.unitId)
      throw new BadRequestException('Vendor is outside your unit');
    const row = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...(b.name ? { name: String(b.name).trim() } : {}),
        ...(b.phone !== undefined ? { phone: b.phone || null } : {}),
        ...(b.email !== undefined ? { email: b.email || null } : {}),
        ...(b.gstin !== undefined ? { gstin: b.gstin || null } : {}),
        ...(b.preApproved !== undefined ? { preApproved: !!b.preApproved } : {}),
        ...(b.active !== undefined ? { active: !!b.active } : {}),
      },
    });
    await this.audit.log(req, 'vendors', id, 'UPDATE', old, row);
    return row;
  }

  // ───────────────────────── purchase requests ─────────────────────────
  @Get('requests')
  @Roles(...BUY_ROLES)
  requests(@Req() req: any, @Query('status') status?: string, @Query('unitId') unitId?: string) {
    return this.prisma.purchaseRequest.findMany({
      where: { ...unitScope(req.user, unitId), ...(status ? { status } : {}) },
      include: { lines: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  @Post('requests')
  @Roles(...BUY_ROLES)
  async createRequest(@Req() req: any, @Body() b: CreatePurchaseRequestDto) {
    const unitId = this.unitFor(req, b.unitId);
    if (!b.title?.trim()) throw new BadRequestException('A title is required');
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!lines.length) throw new BadRequestException('At least one line is required');
    for (const l of lines) {
      if (!l.description?.trim() || !(Number(l.quantity) > 0))
        throw new BadRequestException('Each line needs a description and a positive quantity');
    }
    const row = await this.prisma.purchaseRequest.create({
      data: {
        unitId,
        title: b.title.trim(),
        justification: b.justification?.trim() || null,
        requestedById: req.user.sub,
        lines: {
          create: lines.map((l: any) => ({
            itemId: l.itemId || null,
            description: String(l.description).trim(),
            quantity: Math.round(Number(l.quantity)),
            estimatedCost: Number(l.estimatedCost ?? 0),
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.log(req, 'purchase_requests', row.id, 'INSERT', null, row);
    return row;
  }

  @Post('requests/:id/submit')
  @Roles(...BUY_ROLES)
  async submitRequest(@Req() req: any, @Param('id') id: string) {
    return this.transitionRequest(req, id, 'SUBMITTED');
  }

  @Post('requests/:id/approve')
  @Roles(...APPROVE_ROLES)
  async approveRequest(@Req() req: any, @Param('id') id: string, @Body() b: RequestNoteDto) {
    const row = await this.transitionRequest(req, id, 'APPROVED');
    return this.prisma.purchaseRequest.update({
      where: { id: row.id },
      data: {
        approvedById: req.user.sub,
        approvedAt: new Date(),
        decisionNote: b?.note?.trim() || null,
      },
    });
  }

  @Post('requests/:id/reject')
  @Roles(...APPROVE_ROLES)
  async rejectRequest(@Req() req: any, @Param('id') id: string, @Body() b: RejectRequestDto) {
    if (!b?.note?.trim()) throw new BadRequestException('A rejection note is required');
    const row = await this.transitionRequest(req, id, 'REJECTED');
    return this.prisma.purchaseRequest.update({
      where: { id: row.id },
      data: { approvedById: req.user.sub, approvedAt: new Date(), decisionNote: b.note.trim() },
    });
  }

  private async transitionRequest(req: any, id: string, to: string) {
    const old = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Purchase request not found');
    if (!HO_ROLES.includes(req.user.role) && old.unitId !== req.user.unitId)
      throw new BadRequestException('Request is outside your unit');
    if (!canTransitionRequest(old.status, to))
      throw new BadRequestException(`Cannot move a ${old.status} request to ${to}`);
    const row = await this.prisma.purchaseRequest.update({ where: { id }, data: { status: to } });
    await this.audit.log(
      req,
      'purchase_requests',
      id,
      'UPDATE',
      { status: old.status },
      { status: to },
    );
    return row;
  }

  // ─────────────────────────── purchase orders ───────────────────────────
  @Get('orders')
  @Roles(...BUY_ROLES)
  orders(@Req() req: any, @Query('status') status?: string, @Query('unitId') unitId?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { ...unitScope(req.user, unitId), ...(status ? { status } : {}) },
      include: {
        vendor: { select: { name: true, code: true } },
        lines: true,
        receipts: { select: { id: true, grnNo: true, receivedAt: true } },
        request: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Post('orders')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async createOrder(@Req() req: any, @Body() b: CreatePurchaseOrderDto) {
    const unitId = this.unitFor(req, b.unitId);
    if (!b.vendorId) throw new BadRequestException('A vendor is required');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: b.vendorId } });
    if (!vendor || !vendor.active) throw new BadRequestException('Vendor not found or inactive');
    if (vendor.unitId && vendor.unitId !== unitId)
      throw new BadRequestException('Vendor belongs to another unit');

    let lines: any[] = Array.isArray(b.lines) ? b.lines : [];
    let request: any = null;
    if (b.requestId) {
      request = await this.prisma.purchaseRequest.findUnique({
        where: { id: b.requestId },
        include: { lines: true },
      });
      if (!request) throw new NotFoundException('Purchase request not found');
      if (request.unitId !== unitId)
        throw new BadRequestException('Request belongs to another unit');
      if (request.status !== 'APPROVED' && !b.overrideNote?.trim())
        throw new BadRequestException(
          `Request is ${request.status} — approve it first, or supply an override note`,
        );
      if (!lines.length)
        lines = request.lines.map((l: any) => ({
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity,
          unitCost: Number(l.estimatedCost),
        }));
    }
    if (!lines.length) throw new BadRequestException('At least one line is required');

    const code = await this.unitCode(unitId);
    const prefix = `BB-${code}-PO-${AY_SHORT}-`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { poNo: { startsWith: prefix } },
      orderBy: { poNo: 'desc' },
    });
    const poNo = poNumber(code, nextSerial(prefix, last?.poNo), AY_SHORT);

    const row = await this.prisma.purchaseOrder.create({
      data: {
        unitId,
        vendorId: vendor.id,
        requestId: request?.id ?? null,
        poNo,
        status: 'DRAFT',
        expectedAt: b.expectedAt ? new Date(`${b.expectedAt}T00:00:00Z`) : null,
        totalAmount: orderTotal(lines),
        notes: b.notes?.trim() || b.overrideNote?.trim() || null,
        createdById: req.user.sub,
        lines: {
          create: lines.map((l: any) => ({
            itemId: l.itemId || null,
            description: String(l.description).trim(),
            quantity: Math.round(Number(l.quantity)),
            unitCost: Number(l.unitCost ?? 0),
          })),
        },
      },
      include: { lines: true, vendor: true },
    });
    if (request) {
      await this.prisma.purchaseRequest.update({
        where: { id: request.id },
        data: { status: 'ORDERED' },
      });
    }
    await this.audit.log(req, 'purchase_orders', row.id, 'INSERT', null, {
      poNo,
      total: row.totalAmount,
      override: b.overrideNote ?? null,
    });
    return row;
  }

  @Post('orders/:id/send')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async sendOrder(@Req() req: any, @Param('id') id: string) {
    const old = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Purchase order not found');
    if (!HO_ROLES.includes(req.user.role) && old.unitId !== req.user.unitId)
      throw new BadRequestException('Order is outside your unit');
    if (old.status !== 'DRAFT') throw new BadRequestException(`Order is already ${old.status}`);
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', orderedAt: new Date() },
    });
    await this.audit.log(
      req,
      'purchase_orders',
      id,
      'UPDATE',
      { status: 'DRAFT' },
      { status: 'SENT' },
    );
    return row;
  }

  @Post('orders/:id/cancel')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async cancelOrder(@Req() req: any, @Param('id') id: string, @Body() b: CancelOrderDto) {
    const old = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!old) throw new NotFoundException('Purchase order not found');
    if (!HO_ROLES.includes(req.user.role) && old.unitId !== req.user.unitId)
      throw new BadRequestException('Order is outside your unit');
    if (['RECEIVED', 'CANCELLED'].includes(old.status))
      throw new BadRequestException(`A ${old.status} order cannot be cancelled`);
    if (old.lines.some((l: any) => l.receivedQty > 0))
      throw new BadRequestException('Goods have already been received against this order');
    if (!b?.reason?.trim()) throw new BadRequestException('A cancellation reason is required');
    const row = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED', notes: b.reason.trim() },
    });
    await this.audit.log(
      req,
      'purchase_orders',
      id,
      'UPDATE',
      { status: old.status },
      { status: 'CANCELLED' },
    );
    return row;
  }

  // ─────────────────────────── goods receipts ───────────────────────────
  @Get('goods-receipts')
  @Roles(...BUY_ROLES)
  receipts(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.goodsReceipt.findMany({
      where: HO_ROLES.includes(req.user.role)
        ? unitId
          ? { unitId }
          : {}
        : { unitId: req.user.unitId },
      include: {
        order: { select: { poNo: true, vendor: { select: { name: true } } } },
        lines: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Receive goods. This is the only place stock goes up from a purchase, and
   * it writes the inventory movement in the same transaction as the GRN.
   */
  @Post('orders/:id/receive')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST')
  async receive(@Req() req: any, @Param('id') id: string, @Body() b: ReceiveGoodsDto) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true, vendor: true },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (!HO_ROLES.includes(req.user.role) && order.unitId !== req.user.unitId)
      throw new BadRequestException('Order is outside your unit');
    if (['CANCELLED', 'RECEIVED'].includes(order.status))
      throw new BadRequestException(`A ${order.status} order cannot receive goods`);

    const inputs = (Array.isArray(b?.lines) ? b.lines : []) as {
      orderLineId?: string;
      itemId?: string;
      description?: string;
      quantity: number;
      unitCost?: number;
    }[];
    if (!inputs.length) throw new BadRequestException('At least one received line is required');

    const code = await this.unitCode(order.unitId);
    const prefix = `BB-${code}-GRN-${AY_SHORT}-`;
    const last = await this.prisma.goodsReceipt.findFirst({
      where: { grnNo: { startsWith: prefix } },
      orderBy: { grnNo: 'desc' },
    });
    const grnNo = grnNumber(code, nextSerial(prefix, last?.grnNo), AY_SHORT);

    for (const input of inputs) {
      const qty = Math.round(Number(input.quantity));
      if (!(qty > 0)) throw new BadRequestException('Received quantity must be positive');
      const line = input.orderLineId
        ? order.lines.find((l: any) => l.id === input.orderLineId)
        : null;
      if (input.orderLineId && !line) throw new BadRequestException('Unknown order line');
      if (line && line.receivedQty + qty > line.quantity)
        throw new BadRequestException(
          `Line "${line.description}" would exceed the ordered quantity (${line.quantity})`,
        );
      const itemId = input.itemId ?? line?.itemId ?? null;
      if (!itemId)
        throw new BadRequestException(
          `Line "${input.description ?? line?.description}" is not linked to a stock item`,
        );
    }

    const receipt = await this.prisma.$transaction(async (tx: any) => {
      const grn = await tx.goodsReceipt.create({
        data: {
          orderId: order.id,
          unitId: order.unitId,
          grnNo,
          invoiceNo: b.invoiceNo?.trim() || null,
          invoiceDate: b.invoiceDate ? new Date(`${b.invoiceDate}T00:00:00Z`) : null,
          receivedById: req.user.sub,
          notes: b.notes?.trim() || null,
          lines: {
            create: inputs.map((i) => {
              const line = i.orderLineId
                ? order.lines.find((l: any) => l.id === i.orderLineId)
                : null;
              return {
                orderLineId: line?.id ?? null,
                itemId: i.itemId ?? line?.itemId ?? null,
                description: (i.description ?? line?.description ?? 'Item').trim(),
                quantity: Math.round(Number(i.quantity)),
                unitCost: Number(i.unitCost ?? line?.unitCost ?? 0),
              };
            }),
          },
        },
        include: { lines: true },
      });

      for (const l of grn.lines) {
        if (!l.itemId) continue;
        await tx.inventoryItem.update({
          where: { id: l.itemId },
          data: {
            quantity: { increment: l.quantity },
            ...(Number(l.unitCost) > 0 ? { unitCost: Number(l.unitCost) } : {}),
          },
        });
        await tx.inventoryMovement.create({
          data: {
            itemId: l.itemId,
            unitId: order.unitId,
            type: 'RECEIPT',
            quantity: l.quantity,
            unitCost: Number(l.unitCost) || null,
            reference: grnNo,
            notes: `GRN ${grnNo} · ${order.vendor.name}`,
            createdById: req.user.sub,
          },
        });
      }

      for (const i of inputs) {
        if (!i.orderLineId) continue;
        await tx.purchaseOrderLine.update({
          where: { id: i.orderLineId },
          data: { receivedQty: { increment: Math.round(Number(i.quantity)) } },
        });
      }

      const fresh = await tx.purchaseOrderLine.findMany({ where: { orderId: order.id } });
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: statusAfterReceipt(fresh) },
      });

      return grn;
    });

    // A receipt is the usual way an item comes back above its reorder level.
    for (const i of inputs) {
      const itemId = i.itemId ?? order.lines.find((l: any) => l.id === i.orderLineId)?.itemId;
      if (itemId) await this.reorder.evaluate(itemId).catch(() => 'UNCHANGED');
    }

    await this.audit.log(req, 'goods_receipts', receipt.id, 'INSERT', null, {
      grnNo,
      poNo: order.poNo,
      lines: receipt.lines.length,
    });
    return receipt;
  }

  // ───────────────────────────── petty cash ─────────────────────────────
  @Get('petty-cash')
  @Roles(...BUY_ROLES)
  async pettyCash(@Req() req: any, @Query('unitId') unitId?: string) {
    const unit = this.unitFor(req, unitId);
    const [settings, entries] = await Promise.all([
      this.prisma.unitSettings.findUnique({ where: { unitId: unit } }),
      this.prisma.pettyCashEntry.findMany({
        where: { unitId: unit },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    ]);
    const float = Number(settings?.pettyCashFloat ?? 5000);
    return {
      unitId: unit,
      float,
      balance: pettyCashBalance(float, entries),
      entries,
      spent: entries
        .filter((e: any) => e.type === 'SPEND')
        .reduce((a: number, e: any) => a + Number(e.amount), 0),
    };
  }

  @Post('petty-cash')
  @Roles(...BUY_ROLES)
  async addPettyCash(@Req() req: any, @Body() b: PettyCashDto) {
    const unit = this.unitFor(req, b.unitId);
    if (!(PETTY_CASH_TYPES as readonly string[]).includes(b.type))
      throw new BadRequestException(`Type must be one of ${PETTY_CASH_TYPES.join(', ')}`);
    const amount = Number(b.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be positive');
    if (!b.description?.trim()) throw new BadRequestException('A description is required');

    const settings = await this.prisma.unitSettings.findUnique({ where: { unitId: unit } });
    const float = Number(settings?.pettyCashFloat ?? 5000);
    if (b.type === 'SPEND') {
      const entries = await this.prisma.pettyCashEntry.findMany({ where: { unitId: unit } });
      const balance = pettyCashBalance(float, entries);
      if (!canSpend(balance, amount))
        throw new BadRequestException(
          `Petty cash balance is ₹${balance.toLocaleString('en-IN')} — this spend exceeds it`,
        );
    }

    const row = await this.prisma.pettyCashEntry.create({
      data: {
        unitId: unit,
        date: b.date
          ? new Date(`${b.date}T00:00:00Z`)
          : new Date(new Date().toISOString().slice(0, 10)),
        type: b.type,
        description: b.description.trim(),
        amount,
        receiptRef: b.receiptRef?.trim() || null,
        recordedById: req.user.sub,
      },
    });
    await this.audit.log(req, 'petty_cash_entries', row.id, 'INSERT', null, row);
    return row;
  }

  // ───────────────────────────── reports ─────────────────────────────
  @Get('reports')
  @Roles(...BUY_ROLES)
  reports() {
    return PROCUREMENT_REPORTS;
  }

  @Get('reports/:key')
  @Roles(...BUY_ROLES)
  async report(
    @Req() req: any,
    @Param('key') key: string,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    const unit = HO_ROLES.includes(req.user.role) ? unitId : req.user.unitId;
    const unitFilter = unit ? { unitId: unit } : {};
    let rows: Record<string, unknown>[] = [];
    let payload: any = {};

    switch (key) {
      case 'stock-on-hand': {
        const items = await this.prisma.inventoryItem.findMany({
          where: { active: true, ...(unit ? { OR: [{ unitId: unit }, { unitId: null }] } : {}) },
          orderBy: { name: 'asc' },
        });
        rows = items.map((i: any) => ({
          sku: i.sku,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          reorderLevel: i.reorderLevel,
          unitCost: Number(i.unitCost),
          value: i.quantity * Number(i.unitCost),
        }));
        payload = {
          count: rows.length,
          value: rows.reduce((s, r: any) => s + r.value, 0),
          items: rows,
        };
        break;
      }
      case 'low-stock': {
        const items = await this.prisma.inventoryItem.findMany({
          where: { active: true, ...(unit ? { OR: [{ unitId: unit }, { unitId: null }] } : {}) },
        });
        const low = lowStockRows(items.map((i: any) => ({ ...i, unitCost: Number(i.unitCost) })));
        rows = low.map((i: any) => ({
          sku: i.sku,
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          reorderLevel: i.reorderLevel,
          suggestedQty: i.suggestedQty,
        }));
        payload = { count: rows.length, items: low };
        break;
      }
      case 'movements': {
        const items = await this.prisma.inventoryMovement.findMany({
          where: {
            ...unitFilter,
            ...(from || to
              ? {
                  createdAt: {
                    ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                    ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}),
                  },
                }
              : {}),
          },
          include: { item: { select: { name: true, sku: true, category: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        });
        rows = items.map((m: any) => ({
          date: new Date(m.createdAt).toISOString().slice(0, 10),
          sku: m.item.sku,
          item: m.item.name,
          type: m.type,
          quantity: m.quantity,
          unitCost: m.unitCost ? Number(m.unitCost) : '',
          reference: m.reference ?? '',
          notes: m.notes ?? '',
        }));
        payload = { count: rows.length, movements: items };
        break;
      }
      case 'valuation': {
        const items = await this.prisma.inventoryItem.findMany({
          where: { active: true, ...(unit ? { OR: [{ unitId: unit }, { unitId: null }] } : {}) },
        });
        const valuation = valuationRows(items as any);
        rows = valuation as any;
        payload = { categories: valuation, total: valuation.reduce((s, v) => s + v.value, 0) };
        break;
      }
      case 'consumption': {
        const movements = await this.prisma.inventoryMovement.findMany({
          where: { type: 'ISSUE', ...unitFilter },
          include: { item: { select: { name: true, category: true } } },
          orderBy: { createdAt: 'desc' },
          take: 2000,
        });
        const consumption = consumptionRows(movements as any);
        rows = consumption as any;
        payload = { items: consumption };
        break;
      }
      case 'vendor-purchases': {
        const orders = await this.prisma.purchaseOrder.findMany({
          where: { ...unitFilter, status: { not: 'CANCELLED' } },
          include: { vendor: { select: { name: true, code: true } } },
        });
        const map = new Map<string, { vendor: string; orders: number; value: number }>();
        for (const o of orders) {
          const k = o.vendor.name;
          const row = map.get(k) ?? { vendor: k, orders: 0, value: 0 };
          row.orders += 1;
          row.value += Number(o.totalAmount);
          map.set(k, row);
        }
        rows = [...map.values()].sort((a, b) => b.value - a.value);
        payload = { vendors: rows };
        break;
      }
      case 'open-orders': {
        const orders = await this.prisma.purchaseOrder.findMany({
          where: { ...unitFilter, status: { in: ['DRAFT', 'SENT', 'PARTIAL'] } },
          include: { vendor: { select: { name: true } }, lines: true },
          orderBy: { createdAt: 'asc' },
        });
        rows = orders.map((o: any) => ({
          poNo: o.poNo,
          vendor: o.vendor.name,
          status: o.status,
          expectedAt: o.expectedAt ? new Date(o.expectedAt).toISOString().slice(0, 10) : '',
          total: Number(o.totalAmount),
          openLines: o.lines.filter((l: any) => l.receivedQty < l.quantity).length,
        }));
        payload = { count: rows.length, orders };
        break;
      }
      case 'grn-register': {
        const receipts = await this.prisma.goodsReceipt.findMany({
          where: unitFilter,
          include: {
            order: { select: { poNo: true, vendor: { select: { name: true } } } },
            lines: true,
          },
          orderBy: { receivedAt: 'desc' },
          take: 500,
        });
        rows = receipts.map((r: any) => ({
          grnNo: r.grnNo,
          date: new Date(r.receivedAt).toISOString().slice(0, 10),
          poNo: r.order.poNo,
          vendor: r.order.vendor.name,
          invoiceNo: r.invoiceNo ?? '',
          lines: r.lines.length,
          value: r.lines.reduce((s: number, l: any) => s + l.quantity * Number(l.unitCost), 0),
        }));
        payload = { count: rows.length, receipts };
        break;
      }
      case 'issue-register': {
        const issues = await this.prisma.inventoryMovement.findMany({
          where: { type: 'ISSUE', ...unitFilter },
          include: { item: { select: { name: true, sku: true } } },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        rows = issues.map((m: any) => ({
          date: new Date(m.createdAt).toISOString().slice(0, 10),
          sku: m.item.sku,
          item: m.item.name,
          quantity: Math.abs(m.quantity),
          reference: m.reference ?? '',
          notes: m.notes ?? '',
        }));
        payload = { count: rows.length, issues };
        break;
      }
      case 'petty-cash': {
        const board = await this.pettyCash(unit ? { user: req.user } : req, unitId);
        rows = board.entries.map((e: any) => ({
          date: new Date(e.date).toISOString().slice(0, 10),
          type: e.type,
          description: e.description,
          amount: Number(e.amount),
          receiptRef: e.receiptRef ?? '',
        }));
        payload = board;
        break;
      }
      default:
        throw new NotFoundException(`Unknown report "${key}"`);
    }

    if (format === 'csv') {
      await this.audit.log(req, 'inventory_reports', key, 'INSERT', null, {
        rows: rows.length,
        unitId: unit ?? 'ALL',
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${key}-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return res.send('\uFEFF' + toCsv(rows));
    }
    return res.json({
      report: key,
      unitId: unit ?? null,
      generatedAt: new Date(),
      ...payload,
      rows,
    });
  }
}

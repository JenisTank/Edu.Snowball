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
import { CreateAddonDto, PayAddonDto, StudentAddonDto, WaiveAddonDto } from './dto/addon.dto';

/**
 * Add-on charges: kit, transport, event fees, late-pickup. Billed per student
 * or in bulk for a batch; settled separately from tuition so the instalment
 * allocation stays untouched.
 */

const BILL_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];
const MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

@Controller('fees/addons')
@UseGuards(AuthGuard)
export class FeeAddonsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  @Roles(...BILL_ROLES)
  list(
    @Req() req: any,
    @Query('unitId') unitId?: string,
    @Query('status') status?: string,
    @Query('studentId') studentId?: string,
  ) {
    const scope = unitScope(req.user, unitId);
    return this.prisma.feeAddon.findMany({
      where: { ...scope, ...(status ? { status } : {}), ...(studentId ? { studentId } : {}) },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            batch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { billedAt: 'desc' }],
      take: 300,
    });
  }

  @Post()
  @Roles(...BILL_ROLES)
  async create(@Req() req: any, @Body() b: StudentAddonDto) {
    if (!b.studentId || !b.label?.trim())
      throw new BadRequestException('Student and label required');
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Amount must be positive');
    const student = await this.prisma.student.findUnique({
      where: { id: b.studentId },
      select: { unitId: true, status: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new BadRequestException('Student is outside your unit');
    const row = await this.prisma.feeAddon.create({
      data: {
        studentId: b.studentId,
        unitId: student.unitId,
        label: b.label.trim(),
        amount,
        ledgerType: b.ledgerType === 'EVENING' ? 'EVENING' : 'PRESCHOOL',
        notes: b.notes?.trim() || null,
        createdById: req.user.sub,
      },
    });
    await this.audit.log(req, 'fee_addons', row.id, 'INSERT', null, row);
    return row;
  }

  /** Bill the same add-on to every active student of a batch (kit, event). */
  @Post('bulk')
  @Roles(...BILL_ROLES)
  async bulk(@Req() req: any, @Body() b: CreateAddonDto) {
    const amount = Number(b.amount);
    if (!b.batchId || !b.label?.trim()) throw new BadRequestException('Batch and label required');
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Amount must be positive');
    const batch = await this.prisma.batch.findUnique({
      where: { id: b.batchId },
      include: { students: { where: { status: 'ACTIVE' }, select: { id: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!HO_ROLES.includes(req.user.role) && batch.unitId !== req.user.unitId)
      throw new BadRequestException('Batch is outside your unit');
    if (!batch.students.length) throw new BadRequestException('No active students in this batch');

    const created = await this.prisma.$transaction(
      batch.students.map((s: any) =>
        this.prisma.feeAddon.create({
          data: {
            studentId: s.id,
            unitId: batch.unitId,
            label: b.label.trim(),
            amount,
            notes: b.notes?.trim() || null,
            createdById: req.user.sub,
          },
        }),
      ),
    );
    await this.audit.log(req, 'fee_addons', `bulk:${b.batchId}`, 'INSERT', null, {
      label: b.label,
      amount,
      students: created.length,
    });
    return { ok: true, billed: created.length, amount };
  }

  @Post(':id/settle')
  @Roles(...BILL_ROLES)
  async settle(@Req() req: any, @Param('id') id: string, @Body() b: PayAddonDto) {
    const addon = await this.prisma.feeAddon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Add-on not found');
    if (!HO_ROLES.includes(req.user.role) && addon.unitId !== req.user.unitId)
      throw new BadRequestException('Add-on is outside your unit');
    if (addon.status !== 'PENDING')
      throw new BadRequestException(`This add-on is already ${addon.status.toLowerCase()}`);
    if (!MODES.includes(b.paymentMode))
      throw new BadRequestException(`Payment mode must be one of ${MODES.join(', ')}`);
    const updated = await this.prisma.feeAddon.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentMode: b.paymentMode as any,
        reference: b.reference?.trim() || null,
        settledAt: new Date(),
        settledById: req.user.sub,
      },
    });
    await this.audit.log(
      req,
      'fee_addons',
      id,
      'UPDATE',
      { status: 'PENDING' },
      { status: 'PAID' },
    );
    return updated;
  }

  @Post(':id/waive')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async waive(@Req() req: any, @Param('id') id: string, @Body() b: WaiveAddonDto) {
    const addon = await this.prisma.feeAddon.findUnique({ where: { id } });
    if (!addon) throw new NotFoundException('Add-on not found');
    if (!HO_ROLES.includes(req.user.role) && addon.unitId !== req.user.unitId)
      throw new BadRequestException('Add-on is outside your unit');
    if (addon.status !== 'PENDING')
      throw new BadRequestException('Only a pending add-on can be waived');
    const updated = await this.prisma.feeAddon.update({
      where: { id },
      data: { status: 'WAIVED', notes: b.reason?.trim() || addon.notes, settledAt: new Date() },
    });
    await this.audit.log(
      req,
      'fee_addons',
      id,
      'UPDATE',
      { status: 'PENDING' },
      {
        status: 'WAIVED',
        reason: b.reason ?? null,
      },
    );
    return updated;
  }
}

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
  UseGuards,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CheckOutGuestDto,
  CloseSecurityDepositDto,
  CreateGuestLogDto,
  CreateSecurityDepositDto,
} from './frontdesk.dto';
import {
  canCloseDeposit,
  depositsHeld,
  minutesInside,
  overdueVisits,
  refundable,
  stillInside,
} from './frontdesk.rules';

const DESK = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR', 'RECEPTIONIST'];
const HO_ONLY = ['FOUNDER', 'ACADEMIC_DIR'];

/**
 * Front desk.
 *
 * Two records reception genuinely needs and the ERP did not have: the visitor
 * book (who is in the building, for safeguarding and fire safety) and the
 * security-deposit register (money the centre holds but does not own).
 */
@Controller('frontdesk')
@UseGuards(AuthGuard)
@Roles(...DESK)
export class FrontDeskController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private unitFor(req: any, unitId?: string): string | undefined {
    return HO_ROLES.includes(req.user.role) ? unitId : req.user.unitId;
  }

  // ─────────────────────────── security deposits ───────────────────────────

  @Get('deposits')
  async deposits(@Req() req: any, @Query('unitId') unitId?: string) {
    const unit = this.unitFor(req, unitId);
    const rows = await this.prisma.securityDeposit.findMany({
      where: unit ? { unitId: unit } : {},
      include: {
        employee: { select: { employeeNo: true, fullName: true, designation: true } },
        student: { select: { admissionNo: true, firstName: true, lastName: true } },
      },
      orderBy: [{ status: 'asc' }, { collectedAt: 'desc' }],
      take: 500,
    });
    const totals = depositsHeld(rows.map((r: any) => ({ amount: r.amount, status: r.status })));
    return {
      totals,
      rows: rows.map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        status: r.status,
        notes: r.notes,
        reason: r.reason,
        collectedAt: r.collectedAt,
        closedAt: r.closedAt,
        holder: r.employee
          ? {
              type: 'EMPLOYEE',
              id: r.employeeId,
              name: r.employee.fullName,
              ref: r.employee.employeeNo,
              detail: r.employee.designation,
            }
          : {
              type: 'STUDENT',
              id: r.studentId,
              name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
              ref: r.student?.admissionNo,
              detail: 'Child',
            },
      })),
    };
  }

  @Post('deposits')
  @Roles(...HO_ONLY, 'CENTRE_HEAD')
  async createDeposit(@Req() req: any, @Body() b: CreateSecurityDepositDto) {
    const holder =
      b.holder === 'EMPLOYEE'
        ? await this.prisma.employee.findUnique({ where: { id: b.holderId } })
        : await this.prisma.student.findUnique({ where: { id: b.holderId } });
    if (!holder) throw new NotFoundException(`${b.holder.toLowerCase()} not found`);

    const unitId = (holder as any).unitId as string;
    if (!HO_ROLES.includes(req.user.role) && unitId !== req.user.unitId)
      throw new BadRequestException('Holder is outside your unit');

    // One open deposit per holder: a second collection is a correction, not a
    // second deposit, and stacking them makes the refund ambiguous.
    const existing = await this.prisma.securityDeposit.findFirst({
      where: {
        status: 'HELD',
        ...(b.holder === 'EMPLOYEE' ? { employeeId: b.holderId } : { studentId: b.holderId }),
      },
    });
    if (existing)
      throw new BadRequestException(
        `A deposit of ₹${Number(existing.amount)} is already held — close it before collecting another`,
      );

    const row = await this.prisma.securityDeposit.create({
      data: {
        unitId,
        employeeId: b.holder === 'EMPLOYEE' ? b.holderId : null,
        studentId: b.holder === 'STUDENT' ? b.holderId : null,
        amount: b.amount,
        notes: b.notes?.trim() || null,
        createdById: req.user.sub,
      },
    });
    await this.audit.log(req, 'security_deposits', row.id, 'INSERT', null, row);
    return row;
  }

  /** Return the money, or forfeit it (whole or part) — both need a reason. */
  @Patch('deposits/:id/close')
  @Roles(...HO_ONLY, 'CENTRE_HEAD')
  async closeDeposit(@Req() req: any, @Param('id') id: string, @Body() b: CloseSecurityDepositDto) {
    const row = await this.prisma.securityDeposit.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Deposit not found');
    if (!HO_ROLES.includes(req.user.role) && row.unitId !== req.user.unitId)
      throw new BadRequestException('Deposit is outside your unit');
    if (!canCloseDeposit(row.status))
      throw new BadRequestException(`This deposit is already ${row.status.toLowerCase()}`);

    const amount = Number(row.amount);
    const returned = refundable(amount, b.outcome, b.amount);
    const updated = await this.prisma.securityDeposit.update({
      where: { id },
      data: {
        status: b.outcome,
        closedAt: new Date(),
        reason: b.reason.trim(),
        ...(b.outcome === 'FORFEITED' && returned !== amount
          ? {
              notes: `${row.notes ? `${row.notes} · ` : ''}Returned ₹${returned.toFixed(2)} of ₹${amount.toFixed(2)}`,
            }
          : {}),
      },
    });
    await this.audit.log(req, 'security_deposits', id, 'UPDATE', row, {
      ...updated,
      returned,
    });
    return { ...updated, returned, forfeited: Math.round((amount - returned) * 100) / 100 };
  }

  // ──────────────────────────── visitor book ────────────────────────────

  @Get('guests')
  async guests(@Req() req: any, @Query('unitId') unitId?: string, @Query('date') date?: string) {
    const unit = this.unitFor(req, unitId);
    const day = date ?? new Date().toISOString().slice(0, 10);
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 24 * 3600_000);
    const rows = await this.prisma.guestLog.findMany({
      where: { ...(unit ? { unitId: unit } : {}), inAt: { gte: from, lt: to } },
      orderBy: { inAt: 'desc' },
    });
    const mapped = rows.map((r: any) => ({
      ...r,
      minutesInside: r.outAt ? null : minutesInside(r.inAt),
    }));
    return {
      date: day,
      inside: stillInside(rows).length,
      overdue: overdueVisits(rows).length,
      rows: mapped,
    };
  }

  @Post('guests')
  async checkIn(@Req() req: any, @Body() b: CreateGuestLogDto) {
    const unitId = req.user.unitId ?? '';
    if (!unitId && !HO_ROLES.includes(req.user.role))
      throw new BadRequestException('No unit on this account');

    if (b.studentId) {
      const child = await this.prisma.student.findUnique({
        where: { id: b.studentId },
        select: { id: true, unitId: true },
      });
      if (!child) throw new NotFoundException('Student not found');
      if (child.unitId !== (HO_ROLES.includes(req.user.role) ? child.unitId : unitId))
        throw new BadRequestException('Child is outside your unit');
    }

    const row = await this.prisma.guestLog.create({
      data: {
        unitId,
        guestName: b.guestName.trim(),
        phone: b.phone?.trim() || null,
        organisation: b.organisation?.trim() || null,
        purpose: b.purpose,
        hostName: b.hostName?.trim() || null,
        badgeNo: b.badgeNo?.trim() || null,
        studentId: b.studentId ?? null,
        notes: b.notes?.trim() || null,
        createdById: req.user.sub,
      },
    });
    await this.audit.log(req, 'guest_logs', row.id, 'INSERT', null, row);
    return row;
  }

  @Post('guests/:id/checkout')
  async checkOut(@Req() req: any, @Param('id') id: string, @Body() b: CheckOutGuestDto) {
    const row = await this.prisma.guestLog.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Visit not found');
    if (!HO_ROLES.includes(req.user.role) && row.unitId !== req.user.unitId)
      throw new BadRequestException('Visit is outside your unit');
    if (row.outAt) return row; // idempotent: a double tap is not an error

    const updated = await this.prisma.guestLog.update({
      where: { id },
      data: {
        outAt: new Date(),
        ...(b.notes?.trim()
          ? { notes: `${row.notes ? `${row.notes} · ` : ''}${b.notes.trim()}` }
          : {}),
      },
    });
    await this.audit.log(req, 'guest_logs', id, 'UPDATE', row, updated);
    return updated;
  }
}

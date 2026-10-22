import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { runLeaveCutoffTick } from '../../jobs/scheduler';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];

/** Leave policy, applications and approval workflow. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class LeaveController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get('leave/policies') policies() {
    return this.prisma.leavePolicy.findMany({ orderBy: [{ year: 'desc' }, { leaveType: 'asc' }] });
  }

  @Post('leave/policies') async policy(@Req() req: any, @Body() b: any) {
    if (!b.year || !['CL', 'SL', 'PL'].includes(b.leaveType))
      throw new BadRequestException('Year and CL/SL/PL required');
    const r = await this.prisma.leavePolicy.upsert({
      where: { year_leaveType: { year: Number(b.year), leaveType: b.leaveType } },
      create: {
        year: Number(b.year),
        leaveType: b.leaveType,
        allocation: Number(b.allocation),
        carryForwardCap: Number(b.carryForwardCap),
        effectiveFrom: new Date(b.effectiveFrom || `${b.year}-01-01`),
      },
      update: {
        allocation: Number(b.allocation),
        carryForwardCap: Number(b.carryForwardCap),
        effectiveFrom: new Date(b.effectiveFrom || `${b.year}-01-01`),
      },
    });
    await this.audit.log(req, 'leave_policies', r.id, 'UPDATE', null, r);
    return r;
  }

  @Post('leave/apply') async applyLeave(@Body() b: any) {
    if (!b.employeeId || !b.fromDate || !b.toDate || !b.reason)
      throw new BadRequestException('Complete leave request required');
    const from = new Date(b.fromDate),
      to = new Date(b.toDate),
      days = Math.floor((+to - +from) / 86400000) + 1;
    if (days < 1) throw new BadRequestException('Invalid dates');
    return this.prisma.staffLeave.create({
      data: {
        employeeId: b.employeeId,
        leaveType: b.leaveType,
        fromDate: from,
        toDate: to,
        days,
        reason: b.reason,
      },
    });
  }

  @Get('leave') leaves() {
    return this.prisma.staffLeave.findMany({
      include: { employee: { select: { employeeNo: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Run the auto-LWP cut-off now. Safe to press twice: the daily stamp makes it
   * a no-op unless `force` behaviour is intended, and this route is the one a
   * HR manager uses on the morning of payroll if the tick was missed.
   */
  @Post('leave/cutoff') async runCutoff(@Req() req: any) {
    const result = await runLeaveCutoffTick(this.prisma, new Date(), true);
    await this.audit.log(req, 'staff_leaves', 'auto-lwp-cutoff', 'UPDATE', null, result);
    return result;
  }

  @Patch('leave/:id/approve') async approveLeave(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    const old = await this.prisma.staffLeave.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    const status = b.approved ? 'APPROVED' : 'REJECTED';
    const r = await this.prisma.staffLeave.update({
      where: { id },
      data: { status, hrApprovedById: req.user.sub, isLwp: !!b.isLwp },
    });
    if (b.approved && !b.isLwp)
      await this.prisma.leaveBalance.upsert({
        where: {
          employeeId_year_leaveType: {
            employeeId: r.employeeId,
            year: r.fromDate.getFullYear(),
            leaveType: r.leaveType,
          },
        },
        create: {
          employeeId: r.employeeId,
          year: r.fromDate.getFullYear(),
          leaveType: r.leaveType,
          used: r.days,
        },
        update: { used: { increment: r.days } },
      });
    await this.audit.log(req, 'staff_leaves', id, 'UPDATE', old, r);
    return r;
  }
}

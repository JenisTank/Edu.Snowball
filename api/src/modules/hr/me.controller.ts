import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { PrismaService } from '../../common/database/prisma.service';
import { LeaveApplicationDto } from './me.dto';
import { isPayslipVisible, monthBounds, overlaps, validateLeaveWindow } from './me.rules';

/**
 * Employee self-service.
 *
 * Everything here is scoped to the logged-in user: the staff member is resolved
 * from the JWT's email, never from a path parameter, so one teacher can never
 * read another's payslip. HR keeps its own admin routes under `/hr`.
 */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Staff only — the parent portal has its own token and its own routes. */
  private async employee(user: any) {
    if (user.role === 'PARENT')
      throw new BadRequestException('The parent portal has no staff profile');
    const emp = await this.prisma.employee.findFirst({
      where: { email: user.email ?? '__none__' },
    });
    if (!emp)
      throw new NotFoundException(
        'No staff record is linked to this login yet — ask HR to add your email to your employee profile',
      );
    return emp;
  }

  @Get('profile')
  async profile(@Req() req: any) {
    const emp = await this.employee(req.user);
    const unit = await this.prisma.unit.findUnique({
      where: { id: emp.unitId },
      select: { name: true, code: true },
    });
    return {
      id: emp.id,
      employeeNo: emp.employeeNo,
      fullName: emp.fullName,
      designation: emp.designation,
      department: emp.department,
      employmentType: emp.employmentType,
      joiningDate: emp.joiningDate,
      status: emp.status,
      unit,
      email: emp.email,
      phone: emp.phone,
      reportingManagerId: emp.reportingManagerId,
    };
  }

  @Get('payslips')
  async payslips(@Req() req: any) {
    const emp = await this.employee(req.user);
    const lines = await this.prisma.payrollLine.findMany({
      where: { employeeId: emp.id },
      include: { run: true },
      orderBy: { run: { month: 'desc' } },
      take: 36,
    });
    return lines
      .filter((l: any) => isPayslipVisible(l.run.status))
      .map((l: any) => ({
        id: l.id,
        month: l.run.month,
        type: l.run.type,
        status: l.run.status,
        gross: Number(l.gross),
        deductions: Number(l.deductions),
        net: Number(l.net),
        lwpDays: Number(l.lwpDays),
        workedMinutes: l.workedMinutes,
        details: l.details,
      }));
  }

  @Get('leaves')
  async leaves(@Req() req: any) {
    const emp = await this.employee(req.user);
    return this.prisma.staffLeave.findMany({
      where: { employeeId: emp.id },
      orderBy: { fromDate: 'desc' },
      take: 50,
    });
  }

  @Post('leaves')
  async applyLeave(@Req() req: any, @Body() b: LeaveApplicationDto) {
    const emp = await this.employee(req.user);
    const today = new Date().toISOString().slice(0, 10);
    const check = validateLeaveWindow(b.fromDate, b.toDate, today);
    if (!check.ok) throw new BadRequestException(check.error);

    const existing = await this.prisma.staffLeave.findMany({
      where: { employeeId: emp.id, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      select: { fromDate: true, toDate: true, status: true },
    });
    if (
      overlaps(
        b.fromDate,
        b.toDate,
        existing.map((e: any) => ({
          fromDate: e.fromDate.toISOString().slice(0, 10),
          toDate: e.toDate.toISOString().slice(0, 10),
          status: e.status,
        })),
      )
    )
      throw new BadRequestException('You already have a leave application covering those dates');

    const row = await this.prisma.staffLeave.create({
      data: {
        employeeId: emp.id,
        leaveType: b.leaveType,
        fromDate: new Date(`${b.fromDate}T00:00:00Z`),
        toDate: new Date(`${b.toDate}T00:00:00Z`),
        days: check.days,
        reason: b.reason.trim(),
        status: 'PENDING_MANAGER',
      },
    });
    await this.audit.log(req, 'staff_leaves', row.id, 'INSERT', null, row);
    return row;
  }

  @Get('attendance')
  async attendance(@Req() req: any, @Query('month') month?: string) {
    const emp = await this.employee(req.user);
    const m = month || new Date().toISOString().slice(0, 7);
    const bounds = monthBounds(m);
    if (!bounds.valid) throw new BadRequestException('month must be YYYY-MM');
    return this.prisma.staffAttendance.findMany({
      where: { employeeId: emp.id, date: { gte: bounds.start, lte: bounds.end } },
      orderBy: { date: 'asc' },
    });
  }
}

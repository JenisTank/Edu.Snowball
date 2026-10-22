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
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];
const TYPES = ['MORNING_SALARIED', 'EVENING_HOURLY', 'DUAL'];
const STATUSES = ['ACTIVE', 'ON_NOTICE', 'RELIEVED', 'SUSPENDED'];

/** Employee master, effective-dated employment history and compensation. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class EmployeesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Post('employees/:id/minute-rate') async minuteRate(
    @Req() req: any,
    @Param('id') employeeId: string,
    @Body() b: any,
  ) {
    if (Number(b.rate) <= 0 || !b.effectiveFrom)
      throw new BadRequestException('Positive rate and effective date required');
    const r = await this.prisma.employeeMinuteRate.create({
      data: {
        employeeId,
        rate: Number(b.rate),
        effectiveFrom: new Date(b.effectiveFrom),
        effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
      },
    });
    await this.audit.log(req, 'employee_minute_rates', r.id, 'INSERT', null, r);
    return r;
  }

  @Post('employees/:id/shift') async assignShift(
    @Req() req: any,
    @Param('id') employeeId: string,
    @Body() b: any,
  ) {
    if (!b.shiftId || !b.effectiveFrom)
      throw new BadRequestException('Shift and effective date required');
    const r = await this.prisma.employeeShift.create({
      data: {
        employeeId,
        shiftId: b.shiftId,
        effectiveFrom: new Date(b.effectiveFrom),
        effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
      },
    });
    await this.audit.log(req, 'employee_shifts', r.id, 'INSERT', null, r);
    return r;
  }

  @Post('employees/:id/compensation') async compensation(
    @Req() req: any,
    @Param('id') employeeId: string,
    @Body() b: any,
  ) {
    if (!b.componentId || !b.effectiveFrom)
      throw new BadRequestException('Component and effective date required');
    const r = await this.prisma.employeeSalaryComponent.create({
      data: {
        employeeId,
        componentId: b.componentId,
        value: Number(b.value),
        effectiveFrom: new Date(b.effectiveFrom),
        effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
      },
    });
    await this.audit.log(req, 'employee_salary_components', r.id, 'INSERT', null, r);
    return r;
  }

  @Get('employees')
  employees(@Req() req: any, @Query('unitId') unitId?: string, @Query('status') status?: string) {
    const scope =
      HO_ROLES.includes(req.user.role) || req.user.role === 'HR_MANAGER'
        ? unitId
          ? { unitId }
          : {}
        : { unitId: req.user.unitId };
    return this.prisma.employee.findMany({
      where: { ...scope, ...(status ? { status } : {}) },
      include: {
        manager: { select: { id: true, employeeNo: true, fullName: true } },
        _count: { select: { directReports: true } },
        history: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get('employees/:id') async one(@Param('id') id: string) {
    const row = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        manager: true,
        directReports: {
          select: { id: true, employeeNo: true, fullName: true, designation: true },
        },
        history: { orderBy: { effectiveFrom: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  @Post('employees') async create(@Req() req: any, @Body() b: any) {
    if (
      !b.fullName?.trim() ||
      !b.unitId ||
      !b.designation?.trim() ||
      !b.joiningDate ||
      !TYPES.includes(b.employmentType)
    )
      throw new BadRequestException(
        'Name, unit, designation, joining date and employment type are required',
      );
    const unit = await this.prisma.unit.findUnique({ where: { id: b.unitId } });
    if (!unit) throw new BadRequestException('Invalid unit');
    if (b.reportingManagerId === b.id)
      throw new BadRequestException('Employee cannot report to self');
    const year = new Date(b.joiningDate).getFullYear().toString().slice(-2);
    const count = await this.prisma.employee.count();
    const employeeNo = `BB-${unit.code}-EMP-${year}-${String(count + 1).padStart(4, '0')}`;
    const data = {
      employeeNo,
      fullName: b.fullName.trim(),
      email: b.email?.trim() || null,
      phone: b.phone?.trim() || null,
      dateOfBirth: b.dateOfBirth ? new Date(b.dateOfBirth) : null,
      joiningDate: new Date(b.joiningDate),
      unitId: b.unitId,
      department: b.department || null,
      designation: b.designation.trim(),
      reportingManagerId: b.reportingManagerId || null,
      employmentType: b.employmentType,
      bankAccountName: b.bankAccountName || null,
      bankAccountNo: b.bankAccountNo || null,
      bankIfsc: b.bankIfsc || null,
      pan: b.pan || null,
      uan: b.uan || null,
      esicNumber: b.esicNumber || null,
      pfEnabled: !!b.pfEnabled,
      esicEnabled: !!b.esicEnabled,
      ptEnabled: !!b.ptEnabled,
    };
    const row = await this.prisma.$transaction(async (tx: any) => {
      const e = await tx.employee.create({ data });
      await tx.employmentHistory.create({
        data: {
          employeeId: e.id,
          effectiveFrom: new Date(b.joiningDate),
          unitId: b.unitId,
          department: b.department || null,
          designation: b.designation.trim(),
          employmentType: b.employmentType,
          reportingManagerId: b.reportingManagerId || null,
          reason: 'Initial employment',
          changedById: req.user.sub,
        },
      });
      return e;
    });
    await this.audit.log(req, 'employees', row.id, 'INSERT', null, {
      ...row,
      bankAccountNo: row.bankAccountNo ? '***' : null,
      pan: row.pan ? '***' : null,
    });
    return row;
  }

  @Patch('employees/:id/employment') async change(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    const old = await this.prisma.employee.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    if (b.reportingManagerId === id)
      throw new BadRequestException('Employee cannot report to self');
    if (b.employmentType && !TYPES.includes(b.employmentType))
      throw new BadRequestException('Invalid employment type');
    if (b.status && !STATUSES.includes(b.status)) throw new BadRequestException('Invalid status');
    const effectiveFrom = new Date(b.effectiveFrom || new Date());
    const next = {
      unitId: b.unitId || old.unitId,
      department: b.department === undefined ? old.department : b.department,
      designation: b.designation || old.designation,
      employmentType: b.employmentType || old.employmentType,
      reportingManagerId:
        b.reportingManagerId === undefined ? old.reportingManagerId : b.reportingManagerId || null,
    };
    const row = await this.prisma.$transaction(async (tx: any) => {
      await tx.employmentHistory.updateMany({
        where: { employeeId: id, effectiveTo: null },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - 86400000) },
      });
      await tx.employmentHistory.create({
        data: {
          employeeId: id,
          effectiveFrom,
          ...next,
          reason: b.reason || 'Employment change',
          changedById: req.user.sub,
        },
      });
      return tx.employee.update({
        where: { id },
        data: {
          ...next,
          status: b.status || old.status,
          relievingDate: b.relievingDate ? new Date(b.relievingDate) : old.relievingDate,
        },
      });
    });
    await this.audit.log(req, 'employees', id, 'UPDATE', old, row);
    return row;
  }
}

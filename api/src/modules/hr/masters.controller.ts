import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  CALCULATION_TYPES,
  CreateHolidayDto,
  CreateSalaryComponentDto,
  CreateShiftDto,
  CreateStatutorySchemeDto,
  SALARY_COMPONENT_TYPES,
} from './hr.dto';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];

/** HR masters: shifts, holidays, salary components and statutory schemes. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class MastersController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get('statutory') statutory() {
    return this.prisma.statutoryScheme.findMany({
      include: { slabs: true },
      orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  @Post('statutory') async statutoryMaster(@Req() req: any, @Body() b: CreateStatutorySchemeDto) {
    if (!['PF', 'ESIC', 'PT'].includes(b.code) || !b.effectiveFrom)
      throw new BadRequestException('PF/ESIC/PT and effective date required');
    const r = await this.prisma.statutoryScheme.create({
      data: {
        code: b.code,
        name: b.name || b.code,
        effectiveFrom: new Date(b.effectiveFrom),
        effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
        employeeRate: Number(b.employeeRate || 0),
        employerRate: Number(b.employerRate || 0),
        wageCeiling: b.wageCeiling ? Number(b.wageCeiling) : null,
        calculationBasis: b.calculationBasis || 'GROSS',
        slabs: {
          create: (b.slabs || []).map((x: any) => ({
            minAmount: Number(x.minAmount),
            maxAmount: x.maxAmount ? Number(x.maxAmount) : null,
            deduction: Number(x.deduction),
          })),
        },
      },
    });
    await this.audit.log(req, 'statutory_schemes', r.id, 'INSERT', null, r);
    return r;
  }

  @Get('masters') async masters() {
    const [shifts, holidays, components] = await Promise.all([
      this.prisma.hrShift.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.hrHoliday.findMany({ orderBy: { date: 'desc' } }),
      this.prisma.salaryComponent.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return { shifts, holidays, components };
  }

  @Post('shifts') async shift(@Req() req: any, @Body() b: CreateShiftDto) {
    if (!b.name || !b.code || !b.startTime || !b.endTime || !b.workingMinutes || !b.halfDayMinutes)
      throw new BadRequestException('Complete shift rules required');
    const r = await this.prisma.hrShift.create({
      data: {
        name: b.name,
        code: b.code,
        startTime: b.startTime,
        endTime: b.endTime,
        workingMinutes: Number(b.workingMinutes),
        halfDayMinutes: Number(b.halfDayMinutes),
        otTriggerTime: b.otTriggerTime || null,
      },
    });
    await this.audit.log(req, 'hr_shifts', r.id, 'INSERT', null, r);
    return r;
  }

  @Post('holidays') async holiday(@Req() req: any, @Body() b: CreateHolidayDto) {
    if (!b.date || !b.name) throw new BadRequestException('Date and name required');
    const r = await this.prisma.hrHoliday.create({
      data: {
        unitId: b.unitId || null,
        date: new Date(b.date),
        name: b.name,
        paid: b.paid !== false,
      },
    });
    await this.audit.log(req, 'hr_holidays', r.id, 'INSERT', null, r);
    return r;
  }

  @Post('salary-components') async component(@Req() req: any, @Body() b: CreateSalaryComponentDto) {
    if (
      !b.code ||
      !b.name ||
      !['EARNING', 'DEDUCTION'].includes(b.type) ||
      !['FIXED', 'PERCENTAGE'].includes(b.calculationType)
    )
      throw new BadRequestException('Invalid component');
    const r = await this.prisma.salaryComponent.create({
      data: {
        code: b.code,
        name: b.name,
        type: b.type,
        calculationType: b.calculationType,
        defaultValue: Number(b.defaultValue || 0),
        pfApplicable: !!b.pfApplicable,
        esicApplicable: !!b.esicApplicable,
        ptApplicable: !!b.ptApplicable,
      },
    });
    await this.audit.log(req, 'salary_components', r.id, 'INSERT', null, r);
    return r;
  }
}

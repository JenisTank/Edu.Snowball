import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { Response } from 'express';
import {
  ADJUSTMENT_TYPES,
  CalculatePayrollDto,
  PayrollAdjustmentDto,
  ReversePayrollDto,
} from './hr.dto';

const HR_ROLES = ['FOUNDER', 'HR_MANAGER'];

/** Payroll runs, maker-checker workflow, payslips and statutory application. */
@Controller('hr')
@UseGuards(AuthGuard)
@Roles(...HR_ROLES)
export class PayrollController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get('payroll/:id/export.csv') async exportPayroll(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { include: { employee: true } } },
    });
    if (!run) throw new NotFoundException();
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [
        'Employee No',
        'Employee',
        'Gross',
        'Deductions',
        'Employer Contributions',
        'Net',
        'Worked Minutes',
        'OT Minutes',
      ],
      ...run.lines.map((l: any) => [
        l.employee.employeeNo,
        l.employee.fullName,
        l.gross,
        l.deductions,
        l.employerContributions,
        l.net,
        l.workedMinutes,
        l.otMinutes,
      ]),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${run.type}-${run.month}-v${run.version}.csv"`,
    );
    res.send(rows.map((r: any[]) => r.map(esc).join(',')).join('\n'));
  }

  @Get('payroll/:id/payslips') @Header('Content-Type', 'text/html') async payslips(
    @Param('id') id: string,
  ) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { include: { employee: true } } },
    });
    if (!run) throw new NotFoundException();
    const esc = (v: any) =>
      String(v ?? '').replace(
        /[&<>]/g,
        (c: string) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }) as any)[c],
      );
    const slips = run.lines
      .map(
        (l: any) =>
          `<article><header><b>🐝 BumbleB Kidz</b><span>${run.type} PAYSLIP · ${run.month}</span></header><h2>${esc(l.employee.fullName)}</h2><p>${esc(l.employee.employeeNo)} · ${esc(l.employee.designation)}</p><table><tr><td>Gross earnings</td><th>₹${Number(l.gross).toLocaleString('en-IN')}</th></tr><tr><td>Deductions</td><th>₹${Number(l.deductions).toLocaleString('en-IN')}</th></tr><tr><td>Employer statutory contribution</td><th>₹${Number(l.employerContributions).toLocaleString('en-IN')}</th></tr><tr class="net"><td>Net payable</td><th>₹${Number(l.net).toLocaleString('en-IN')}</th></tr></table><small>Worked ${l.workedMinutes} min · OT ${l.otMinutes} min · LWP ${l.lwpDays} days · Version ${run.version}</small></article>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${run.month}</title><style>body{font-family:Arial;background:#eee;margin:0}.bar{text-align:center;padding:10px;background:#fff}.bar button{padding:9px 20px;background:#a97716;color:#fff;border:0;border-radius:8px}article{width:180mm;min-height:110mm;margin:10mm auto;padding:12mm;background:#fff;border:1px solid #dec98e;page-break-after:always}header{display:flex;justify-content:space-between;background:#f8edcd;padding:10px}h2{margin-bottom:2px}p{color:#777;margin-top:0}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:10px;border-bottom:1px solid #eee;text-align:left}.net{background:#f8edcd;font-size:18px}@media print{.bar{display:none}body{background:#fff}article{margin:0;border:0}}</style></head><body><div class="bar"><button onclick="print()">Print ${run.lines.length} payslips</button></div>${slips}</body></html>`;
  }

  @Get('reports/summary') async payrollSummary(@Query('month') month?: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: month ? { month } : {},
      include: { lines: true },
    });
    return runs.map((r: any) => ({
      id: r.id,
      type: r.type,
      month: r.month,
      status: r.status,
      version: r.version,
      employees: r.lines.length,
      gross: r.lines.reduce((n: number, l: any) => n + Number(l.gross), 0),
      deductions: r.lines.reduce((n: number, l: any) => n + Number(l.deductions), 0),
      employerContributions: r.lines.reduce(
        (n: number, l: any) => n + Number(l.employerContributions),
        0,
      ),
      net: r.lines.reduce((n: number, l: any) => n + Number(l.net), 0),
    }));
  }

  @Post('payroll/:id/submit')
  async submitPayroll(@Req() req: any, @Param('id') id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!run || run.status !== 'DRAFT' || !run.lines.length)
      throw new BadRequestException('Non-empty draft required');
    const year = Number(run.month.slice(0, 4));
    const month = Number(run.month.slice(5, 7));
    const unresolved = await this.prisma.staffAttendance.count({
      where: {
        exception: { not: null },
        exceptionResolved: false,
        date: { gte: new Date(`${run.month}-01`), lt: new Date(year, month, 1) },
      },
    });
    if (unresolved) throw new BadRequestException('Resolve attendance exceptions first');
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedById: req.user.sub },
    });
  }

  @Post('payroll/:id/approve') async approvePayroll(@Req() req: any, @Param('id') id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run || run.status !== 'SUBMITTED') throw new BadRequestException('Submitted run required');
    if (run.createdById === req.user.sub || run.submittedById === req.user.sub)
      throw new BadRequestException('Maker cannot approve own payroll');
    const r = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: req.user.sub, approvedAt: new Date() },
    });
    await this.audit.log(req, 'payroll_runs', id, 'UPDATE', run, r);
    return r;
  }

  @Post('payroll/:id/lock') async lockPayroll(@Req() req: any, @Param('id') id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run || run.status !== 'APPROVED' || run.approvedById !== req.user.sub)
      throw new BadRequestException('Approving checker must lock approved run');
    return this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'LOCKED', lockedAt: new Date() },
    });
  }

  @Post('payroll/:id/reverse') async reversePayroll(
    @Req() req: any,
    @Param('id') id: string,
    @Body() b: ReversePayrollDto,
  ) {
    const old = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!old || old.status !== 'LOCKED' || !b.reason)
      throw new BadRequestException('Locked run and reason required');
    const revised = await this.prisma.$transaction(async (tx: any) => {
      await tx.payrollRun.update({ where: { id }, data: { status: 'REVERSED' } });
      const r = await tx.payrollRun.create({
        data: {
          type: old.type,
          month: old.month,
          unitId: old.unitId,
          status: 'DRAFT',
          version: old.version + 1,
          reversalOfId: old.id,
          createdById: req.user.sub,
        },
      });
      for (const l of old.lines)
        await tx.payrollLine.create({
          data: {
            runId: r.id,
            employeeId: l.employeeId,
            gross: l.gross,
            deductions: l.deductions,
            employerContributions: l.employerContributions,
            net: l.net,
            workedMinutes: l.workedMinutes,
            otMinutes: l.otMinutes,
            lwpDays: l.lwpDays,
            details: { ...(l.details as any), reversalReason: b.reason },
          },
        });
      return r;
    });
    await this.audit.log(req, 'payroll_runs', id, 'UPDATE', old, {
      reversed: true,
      revisedId: revised.id,
      reason: b.reason,
    });
    return revised;
  }

  @Post('payroll/adjustments') async adjustment(@Req() req: any, @Body() b: PayrollAdjustmentDto) {
    if (
      !b.employeeId ||
      !b.month ||
      !(ADJUSTMENT_TYPES as readonly string[]).includes(b.type) ||
      Number(b.amount) <= 0 ||
      !b.reason
    )
      throw new BadRequestException('Complete adjustment required');
    return this.prisma.payrollAdjustment.create({
      data: {
        employeeId: b.employeeId,
        month: b.month,
        type: b.type,
        amount: Number(b.amount),
        reason: b.reason,
        sourceRunId: b.sourceRunId || null,
        createdById: req.user.sub,
      },
    });
  }

  @Post('payroll/:id/apply-statutory') async applyStatutory(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { include: { employee: true } } },
    });
    if (!run || run.status !== 'DRAFT') throw new BadRequestException('Draft payroll run required');
    const date = new Date(`${run.month}-01`),
      schemes = await this.prisma.statutoryScheme.findMany({
        where: {
          active: true,
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        include: { slabs: true },
      });
    // Professional Tax is switchable per unit: some centres are exempt, and a
    // wrong PT deduction is a statutory filing error, not a rounding difference.
    const settings = run.unitId
      ? await this.prisma.unitSettings.findUnique({ where: { unitId: run.unitId } })
      : null;
    const ptAllowed = settings ? settings.ptEnabled : true;

    for (const l of run.lines) {
      let employeeDed = 0,
        employer = 0;
      const applied: any = {};
      for (const s of schemes) {
        if (!(l.employee as any)[`${s.code.toLowerCase()}Enabled`]) continue;
        if (s.code === 'PT' && !ptAllowed) continue;
        const basis = Math.min(
          Number(l.gross),
          s.wageCeiling ? Number(s.wageCeiling) : Number(l.gross),
        );
        let deduction =
          s.code === 'PT'
            ? s.slabs.find(
                (x: any) =>
                  basis >= Number(x.minAmount) && (!x.maxAmount || basis <= Number(x.maxAmount)),
              )?.deduction || 0
            : (basis * Number(s.employeeRate)) / 100;
        const er = (basis * Number(s.employerRate)) / 100;
        employeeDed += Number(deduction);
        employer += er;
        applied[s.code] = { basis, deduction: Number(deduction), employer: er };
      }
      await this.prisma.payrollLine.update({
        where: { id: l.id },
        data: {
          deductions: { increment: employeeDed },
          employerContributions: employer,
          net: { decrement: employeeDed },
          details: { ...(l.details as any), statutory: applied },
        },
      });
    }
    await this.audit.log(req, 'payroll_runs', id, 'UPDATE', null, { statutoryApplied: true });
    return this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: true } });
  }

  @Post('payroll/evening/calculate') async eveningPayroll(
    @Req() req: any,
    @Body() b: CalculatePayrollDto,
  ) {
    const month = b.month;
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Month must be YYYY-MM');
    const [y, m] = month.split('-').map(Number),
      from = new Date(`${month}-01`),
      to = new Date(y, m, 1);
    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        employmentType: { in: ['EVENING_HOURLY', 'DUAL'] },
        ...(b.unitId ? { unitId: b.unitId } : {}),
      },
    });
    const run = await this.prisma.payrollRun.create({
      data: { type: 'EVENING', month, unitId: b.unitId || null, createdById: req.user.sub },
    });
    for (const e of employees) {
      const rate = await this.prisma.employeeMinuteRate.findFirst({
        where: {
          employeeId: e.id,
          effectiveFrom: { lte: new Date(y, m - 1, new Date(y, m, 0).getDate()) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!rate) continue;
      const att = await this.prisma.staffAttendance.findMany({
        where: { employeeId: e.id, date: { gte: from, lt: to } },
      });
      if (att.some((a: any) => a.exception && !a.exceptionResolved)) continue;
      const worked = att.reduce((n: number, a: any) => n + a.workedMinutes, 0);
      const ot = await this.prisma.overtimeAuthorisation.findMany({
        where: { employeeId: e.id, status: 'APPROVED', date: { gte: from, lt: to } },
      });
      const otPay = ot.reduce(
          (n: number, x: any) =>
            n + (x.eligibleMinutes || 0) * Number(rate.rate) * Number(x.multiplier),
          0,
        ),
        gross = worked * Number(rate.rate) + otPay;
      await this.prisma.payrollLine.create({
        data: {
          runId: run.id,
          employeeId: e.id,
          gross,
          deductions: 0,
          net: gross,
          workedMinutes: worked,
          otMinutes: ot.reduce((n: number, x: any) => n + (x.eligibleMinutes || 0), 0),
          details: { minuteRate: Number(rate.rate), regularPay: worked * Number(rate.rate), otPay },
        },
      });
    }
    return this.prisma.payrollRun.findUnique({
      where: { id: run.id },
      include: { lines: { include: { employee: true } } },
    });
  }

  @Post('payroll/morning/calculate') async morningPayroll(
    @Req() req: any,
    @Body() b: CalculatePayrollDto,
  ) {
    const month = b.month;
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Month must be YYYY-MM');
    const [y, m] = month.split('-').map(Number),
      days = new Date(y, m, 0).getDate(),
      from = new Date(`${month}-01`),
      to = new Date(y, m, 1);
    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        employmentType: { in: ['MORNING_SALARIED', 'DUAL'] },
        ...(b.unitId ? { unitId: b.unitId } : {}),
      },
    });
    const run = await this.prisma.payrollRun.create({
      data: { type: 'MORNING', month, unitId: b.unitId || null, createdById: req.user.sub },
    });
    for (const e of employees) {
      const comps = await this.prisma.employeeSalaryComponent.findMany({
        where: {
          employeeId: e.id,
          effectiveFrom: { lte: new Date(y, m - 1, days) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
        },
        include: { component: true },
      });
      const earnings = comps
          .filter((x: any) => x.component.type === 'EARNING')
          .reduce((n: number, x: any) => n + Number(x.value), 0),
        fixedDed = comps
          .filter((x: any) => x.component.type === 'DEDUCTION')
          .reduce((n: number, x: any) => n + Number(x.value), 0);
      const att = await this.prisma.staffAttendance.findMany({
        where: { employeeId: e.id, date: { gte: from, lt: to } },
      });
      if (att.some((a: any) => a.exception && !a.exceptionResolved)) continue;
      const leaves = await this.prisma.staffLeave.findMany({
        where: {
          employeeId: e.id,
          status: 'APPROVED',
          isLwp: true,
          fromDate: { lt: to },
          toDate: { gte: from },
        },
      });
      const lwp = leaves.reduce((n: number, x: any) => n + Number(x.days), 0),
        perDay = earnings / days;
      const late = att
        .filter((a: any) => a.lateMinutes > 0)
        .sort((a: any, b: any) => a.date - b.date);
      let lateDed = 0;
      late.slice(2).forEach((a: any) => {
        if (a.lateMinutes <= 30) lateDed += earnings * 0.0035;
        else if (a.lateMinutes <= 60) lateDed += perDay / 24;
        else if (a.lateMinutes <= 120) lateDed += perDay / 12;
        else lateDed += perDay / 6;
      });
      const ot = await this.prisma.overtimeAuthorisation.findMany({
        where: { employeeId: e.id, status: 'APPROVED', date: { gte: from, lt: to } },
      });
      const minuteRate =
          earnings /
          days /
          ((att.length && att.reduce((n: number, a: any) => n + a.workedMinutes, 0) / att.length) ||
            420),
        otPay = ot.reduce(
          (n: number, x: any) => n + (x.eligibleMinutes || 0) * minuteRate * Number(x.multiplier),
          0,
        );
      const adjustments = await this.prisma.payrollAdjustment.findMany({
        where: { employeeId: e.id, month, status: 'APPROVED' },
      });
      const adj = adjustments.reduce(
          (n: number, x: any) => n + (x.type === 'EARNING' ? 1 : -1) * Number(x.amount),
          0,
        ),
        ded = fixedDed + lwp * perDay + lateDed,
        gross = earnings + otPay + Math.max(0, adj),
        net = gross - ded + Math.min(0, adj);
      await this.prisma.payrollLine.create({
        data: {
          runId: run.id,
          employeeId: e.id,
          gross,
          deductions: ded,
          net,
          workedMinutes: att.reduce((n: number, a: any) => n + a.workedMinutes, 0),
          otMinutes: ot.reduce((n: number, x: any) => n + (x.eligibleMinutes || 0), 0),
          lwpDays: lwp,
          details: {
            calendarDays: days,
            baseEarnings: earnings,
            fixedDeduction: fixedDed,
            lwpDeduction: lwp * perDay,
            lateDeduction: lateDed,
            otPay,
            adjustment: adj,
          },
        },
      });
    }
    return this.prisma.payrollRun.findUnique({
      where: { id: run.id },
      include: { lines: { include: { employee: true } } },
    });
  }

  @Get('payroll/runs') runs() {
    return this.prisma.payrollRun.findMany({
      include: {
        lines: { include: { employee: { select: { employeeNo: true, fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

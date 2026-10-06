import { Controller, Get, Param, Query, Req, UseGuards, Module } from '@nestjs/common';
import { AuthGuard, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';

// ─────────────────────────── UNITS ───────────────────────────
@Controller('units')
@UseGuards(AuthGuard)
export class UnitsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const where = HO_ROLES.includes(req.user.role) ? {} : { id: req.user.unitId ?? '__none__' };
    return this.prisma.unit.findMany({ where, include: { settings: true, _count: { select: { students: true, batches: true } } }, orderBy: { code: 'asc' } });
  }
}

// ─────────────────────────── PROGRAMMES ───────────────────────────
@Controller('programmes')
@UseGuards(AuthGuard)
export class ProgrammesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.programme.findMany({ orderBy: { sortOrder: 'asc' } });
  }
}

// ─────────────────────────── BATCHES ───────────────────────────
@Controller('batches')
@UseGuards(AuthGuard)
export class BatchesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.batch.findMany({
      where: unitScope(req.user, unitId),
      include: { programme: true, unit: { select: { code: true, name: true } }, _count: { select: { students: true } } },
      orderBy: [{ unitId: 'asc' }, { name: 'asc' }],
    });
  }
}

// ─────────────────────────── STUDENTS ───────────────────────────
@Controller('students')
@UseGuards(AuthGuard)
export class StudentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.student.findMany({
      where: unitScope(req.user, unitId),
      include: {
        programme: { select: { name: true, tierName: true, levelColour: true } },
        batch: { select: { name: true, shift: true } },
        unit: { select: { code: true, name: true } },
      },
      orderBy: { admissionNo: 'asc' },
    });
  }

  @Get(':id')
  one(@Req() req: any, @Param('id') id: string) {
    return this.prisma.student.findFirst({
      where: { id, ...unitScope(req.user) },
      include: { programme: true, batch: true, unit: true, feeTransactions: { orderBy: { paymentDate: 'desc' } } },
    });
  }
}

// ─────────────────────────── LEADS ───────────────────────────
@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role)
      ? (unitId ? { assignedUnitId: unitId } : {})
      : { OR: [{ assignedUnitId: req.user.unitId ?? '__none__' }, { suggestedUnitId: req.user.unitId ?? '__none__' }] };
    return this.prisma.lead.findMany({
      where: scope,
      include: {
        programmeInterest: { select: { name: true, levelColour: true } },
        assignedUnit: { select: { code: true } },
        suggestedUnit: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// ─────────────────────────── DASHBOARD ───────────────────────────
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  async summary(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [students, leadsOpen, batches, presentToday, totalToday, feeAgg, programmes, recentLeads, stageGroups] = await Promise.all([
      this.prisma.student.count({ where: { ...scope, status: 'ACTIVE' } }),
      this.prisma.lead.count({ where: { ...(HO_ROLES.includes(req.user.role) ? (unitId ? { assignedUnitId: unitId } : {}) : { assignedUnitId: req.user.unitId ?? '__none__' }), stage: { notIn: ['ENROLLED', 'LOST'] } } }),
      this.prisma.batch.count({ where: { ...scope, isActive: true } }),
      this.prisma.attendanceRecord.count({ where: { ...scope, date: today, status: 'PRESENT' } }),
      this.prisma.attendanceRecord.count({ where: { ...scope, date: today } }),
      this.prisma.feeTransaction.aggregate({ where: { ...scope, isCancelled: false }, _sum: { amount: true }, _count: true }),
      this.prisma.programme.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { students: Object.keys(scope).length ? { where: scope as any } : true } } },
      }),
      this.prisma.lead.findMany({
        where: HO_ROLES.includes(req.user.role) ? {} : { assignedUnitId: req.user.unitId ?? '__none__' },
        take: 5, orderBy: { createdAt: 'desc' },
        include: { programmeInterest: { select: { name: true } }, assignedUnit: { select: { code: true } } },
      }),
      this.prisma.lead.groupBy({ by: ['stage'], _count: true }),
    ]);

    return {
      students, leadsOpen, batches,
      attendance: { present: presentToday, total: totalToday },
      fees: { collected: feeAgg._sum.amount ?? 0, receipts: feeAgg._count },
      programmeDistribution: programmes.map(p => ({ name: p.name, tierName: p.tierName, colour: p.levelColour, count: (p as any)._count.students })),
      recentLeads,
      funnel: stageGroups.map(g => ({ stage: g.stage, count: (g as any)._count })),
    };
  }
}

// ─────────────────────────── MODULE ───────────────────────────
@Module({
  controllers: [UnitsController, ProgrammesController, BatchesController, StudentsController, LeadsController, DashboardController],
  providers: [PrismaService],
})
export class ErpModule {}

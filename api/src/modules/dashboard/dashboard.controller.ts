import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth/auth.guard';
import { unitScope } from '../../common/auth/unit-scope';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';

// ─────────────────────────── DASHBOARD ───────────────────────────
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  async summary(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      students,
      leadsOpen,
      batches,
      presentToday,
      totalToday,
      feeAgg,
      programmes,
      recentLeads,
      stageGroups,
    ] = await Promise.all([
      this.prisma.student.count({ where: { ...scope, status: 'ACTIVE' } }),
      this.prisma.lead.count({
        where: {
          ...(HO_ROLES.includes(req.user.role)
            ? unitId
              ? { assignedUnitId: unitId }
              : {}
            : { assignedUnitId: req.user.unitId ?? '__none__' }),
          stage: { notIn: ['ENROLLED', 'LOST'] },
        },
      }),
      this.prisma.batch.count({ where: { ...scope, isActive: true } }),
      this.prisma.attendanceRecord.count({ where: { ...scope, date: today, status: 'PRESENT' } }),
      this.prisma.attendanceRecord.count({ where: { ...scope, date: today } }),
      this.prisma.feeTransaction.aggregate({
        where: { ...scope, isCancelled: false },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.programme.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { students: Object.keys(scope).length ? { where: scope as any } : true },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: HO_ROLES.includes(req.user.role)
          ? {}
          : { assignedUnitId: req.user.unitId ?? '__none__' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          programmeInterest: { select: { name: true } },
          assignedUnit: { select: { code: true } },
        },
      }),
      this.prisma.lead.groupBy({ by: ['stage'], _count: true }),
    ]);

    return {
      students,
      leadsOpen,
      batches,
      attendance: { present: presentToday, total: totalToday },
      fees: { collected: feeAgg._sum.amount ?? 0, receipts: feeAgg._count },
      programmeDistribution: programmes.map((p) => ({
        name: p.name,
        tierName: p.tierName,
        colour: p.levelColour,
        count: (p as any)._count.students,
      })),
      recentLeads,
      funnel: stageGroups.map((g) => ({ stage: g.stage, count: (g as any)._count })),
    };
  }
}

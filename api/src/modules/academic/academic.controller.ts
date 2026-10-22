import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import {
  canChangeStatus,
  canEdit,
  canLock,
  canUnlock,
  dailyPlan,
  isLocked,
  nextVersion,
  validateOverlay,
  type PlanRecord,
} from './academic.rules';
import {
  ChangePlanStatusDto,
  CreateAcademicPlanDto,
  CreateOverlayDto,
  LockPlanDto,
  UpdateAcademicPlanDto,
} from './academic.dto';

/**
 * Academic planning: Yearly Goals, Big Rocks, Calendar and the Log Plan.
 *
 * Head Office authors a master and locks it; a unit consumes the locked master
 * and may add its own overlay. The Daily Plan is a *derived* view over the
 * Calendar and the Log Plan — there is no second copy to drift.
 */
@Controller('academic')
@UseGuards(AuthGuard)
export class AcademicController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private scopeFor(user: any, unitId?: string) {
    if (HO_ROLES.includes(user.role)) return unitId ? { unitId } : {};
    return { OR: [{ unitId: user.unitId }, { unitId: null }] };
  }

  @Get()
  list(@Req() req: any, @Query('kind') kind?: string, @Query('unitId') unitId?: string) {
    return this.prisma.academicPlan.findMany({
      where: { ...this.scopeFor(req.user, unitId), ...(kind ? { kind } : {}) },
      orderBy: [{ academicYear: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * The day's plan, derived from the Calendar and the Log Plan.
   * `GET /academic/daily-plan?date=2026-10-22[&unitId=…]`
   */
  @Get('daily-plan')
  async day(@Req() req: any, @Query('date') date?: string, @Query('unitId') unitId?: string) {
    const dateISO = date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO))
      throw new BadRequestException('date must be YYYY-MM-DD');
    const unit = HO_ROLES.includes(req.user.role) ? (unitId ?? null) : req.user.unitId;
    const plans = await this.prisma.academicPlan.findMany({
      where: {
        kind: { in: ['CALENDAR', 'LOG_PLAN'] },
        status: { in: ['APPROVED', 'LOCKED'] },
        ...(unit ? { OR: [{ unitId }, { unitId: null }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    const items = dailyPlan(plans as unknown as PlanRecord[], dateISO, { unitId: unit });
    return {
      date: dateISO,
      unitId: unit,
      count: items.length,
      items,
    };
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async create(@Req() req: any, @Body() b: CreateAcademicPlanDto) {
    const isHoUser = ['FOUNDER', 'ACADEMIC_DIR'].includes(req.user.role);
    // A unit-scoped user always writes for their own unit, never HO-wide.
    const unitId = isHoUser ? (b.unitId ?? null) : req.user.unitId;
    if (!isHoUser && !unitId) throw new ForbiddenException('No unit on this login');

    if (b.startDate && b.endDate && b.endDate < b.startDate)
      throw new BadRequestException('The end date cannot precede the start date');

    let masterId: string | null = null;
    if (b.masterId) {
      const master = await this.prisma.academicPlan.findUnique({ where: { id: b.masterId } });
      const check = validateOverlay(
        master as unknown as PlanRecord | null,
        { unitId, kind: b.kind },
        req.user,
      );
      if (!check.ok) throw new BadRequestException(check.error);
      masterId = b.masterId;
    }

    const r = await this.prisma.academicPlan.create({
      data: {
        unitId,
        programmeId: b.programmeId ?? null,
        academicYear: b.academicYear ?? '2026-27',
        kind: b.kind,
        title: b.title.trim(),
        description: b.description?.trim() || null,
        month: b.month ?? null,
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        parentVisible: !!b.parentVisible,
        payload: (b.payload ?? {}) as any,
        authoredById: req.user.sub,
        masterId,
      },
    });
    await this.audit.log(req, 'academic_plans', r.id, 'INSERT', null, r);
    return r;
  }

  /** Edit a record: bump the version, refuse if Head Office locked it. */
  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async update(@Req() req: any, @Param('id') id: string, @Body() b: UpdateAcademicPlanDto) {
    const old = await this.prisma.academicPlan.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    const perm = canEdit(old as unknown as PlanRecord, req.user);
    if (!perm.allowed) throw new ForbiddenException(perm.reason);
    if (b.startDate && b.endDate && b.endDate < b.startDate)
      throw new BadRequestException('The end date cannot precede the start date');

    const r = await this.prisma.academicPlan.update({
      where: { id },
      data: {
        ...(b.title === undefined ? {} : { title: b.title.trim() }),
        ...(b.description === undefined ? {} : { description: b.description?.trim() || null }),
        ...(b.month === undefined ? {} : { month: b.month }),
        ...(b.startDate === undefined ? {} : { startDate: new Date(b.startDate) }),
        ...(b.endDate === undefined ? {} : { endDate: new Date(b.endDate) }),
        ...(b.parentVisible === undefined ? {} : { parentVisible: b.parentVisible }),
        ...(b.payload === undefined ? {} : { payload: b.payload as any }),
        version: nextVersion(old.version),
      },
    });
    await this.audit.log(req, 'academic_plans', id, 'UPDATE', old, r);
    return r;
  }

  @Patch(':id/status')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async status(@Req() req: any, @Param('id') id: string, @Body() b: ChangePlanStatusDto) {
    const old = await this.prisma.academicPlan.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    if (req.user.role === 'CENTRE_HEAD' && old.unitId && old.unitId !== req.user.unitId)
      throw new ForbiddenException();

    const move = canChangeStatus(old.status, b.status);
    if (!move.ok) throw new BadRequestException(move.error);
    if (b.status === 'LOCKED' && !canLock(old as unknown as PlanRecord, req.user)) {
      throw new ForbiddenException('Only Head Office can lock a plan');
    }

    const r = await this.prisma.academicPlan.update({
      where: { id },
      data: {
        status: b.status,
        ...(b.status === 'APPROVED' ? { approvedById: req.user.sub, approvedAt: new Date() } : {}),
        // Leaving LOCKED clears the lock stamp; entering it records who locked.
        ...(b.status === 'LOCKED'
          ? { lockedById: req.user.sub, lockedAt: new Date() }
          : isLocked(old)
            ? { lockedById: null, lockedAt: null }
            : {}),
        version: nextVersion(old.version),
      },
    });
    await this.audit.log(req, 'academic_plans', id, 'UPDATE', old, r);
    return r;
  }

  /** Lock a master so units consume it read-only. */
  @Post(':id/lock')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async lock(@Req() req: any, @Param('id') id: string, @Body() b: LockPlanDto) {
    const old = await this.prisma.academicPlan.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    if (!canLock(old as unknown as PlanRecord, req.user))
      throw new BadRequestException('This plan is already locked');
    const r = await this.prisma.academicPlan.update({
      where: { id },
      data: {
        status: 'LOCKED',
        lockedById: req.user.sub,
        lockedAt: new Date(),
        version: nextVersion(old.version),
      },
    });
    await this.audit.log(req, 'academic_plans', id, 'UPDATE', old, {
      ...r,
      note: b.note?.trim() || null,
    });
    return r;
  }

  /** Only the Founder unlocks — that is the point of a Head Office lock. */
  @Post(':id/unlock')
  @Roles('FOUNDER')
  async unlock(@Req() req: any, @Param('id') id: string, @Body() b: LockPlanDto) {
    const old = await this.prisma.academicPlan.findUnique({ where: { id } });
    if (!old) throw new NotFoundException();
    if (!canUnlock(req.user)) throw new ForbiddenException('Only the Founder can unlock');
    if (!isLocked(old)) throw new BadRequestException('This plan is not locked');
    const r = await this.prisma.academicPlan.update({
      where: { id },
      data: {
        status: 'APPROVED',
        lockedById: null,
        lockedAt: null,
        version: nextVersion(old.version),
      },
    });
    await this.audit.log(req, 'academic_plans', id, 'UPDATE', old, {
      ...r,
      note: b.note?.trim() || null,
    });
    return r;
  }

  /**
   * Unit overlay on an AD master: the unit adapts a locked master without
   * forking it. One overlay per master per unit.
   */
  @Post(':id/overlay')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async overlay(@Req() req: any, @Param('id') id: string, @Body() b: CreateOverlayDto) {
    const master = await this.prisma.academicPlan.findUnique({ where: { id } });
    if (!master) throw new NotFoundException('Master plan not found');
    const unitId = b.unitId || (HO_ROLES.includes(req.user.role) ? null : req.user.unitId);
    const check = validateOverlay(master as unknown as PlanRecord, { unitId }, req.user);
    if (!check.ok) throw new BadRequestException(check.error);

    const existing = await this.prisma.academicPlan.findFirst({
      where: { masterId: id, unitId: unitId as string },
    });
    const data = {
      unitId: unitId as string,
      programmeId: master.programmeId,
      academicYear: master.academicYear,
      kind: master.kind,
      title: b.title?.trim() || master.title,
      description: b.description?.trim() || master.description,
      month: master.month,
      startDate: master.startDate,
      endDate: master.endDate,
      parentVisible: master.parentVisible,
      payload: (b.payload ?? master.payload ?? {}) as any,
      masterId: id,
    };

    if (existing) {
      const perm = canEdit(existing as unknown as PlanRecord, req.user);
      if (!perm.allowed) throw new ForbiddenException(perm.reason);
      const r = await this.prisma.academicPlan.update({
        where: { id: existing.id },
        data: { ...data, version: nextVersion(existing.version) },
      });
      await this.audit.log(req, 'academic_plans', r.id, 'UPDATE', existing, r);
      return r;
    }

    const r = await this.prisma.academicPlan.create({
      data: { ...data, status: master.status, authoredById: req.user.sub },
    });
    await this.audit.log(req, 'academic_plans', r.id, 'INSERT', null, r);
    return r;
  }

  /** Master + its overlays, for the AD review screen. */
  @Get(':id/overlays')
  async overlays(@Req() req: any, @Param('id') id: string) {
    const master = await this.prisma.academicPlan.findUnique({
      where: { id },
      include: { overlays: true },
    });
    if (!master) throw new NotFoundException();
    const unitId = req.user.unitId;
    return {
      ...master,
      overlays: HO_ROLES.includes(req.user.role)
        ? master.overlays
        : master.overlays.filter((o: any) => o.unitId === unitId),
    };
  }
}

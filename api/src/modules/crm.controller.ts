import {
  Body, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';

const AY = '2026-27';
const AY_SHORT = '2627';
// Roles allowed to route / re-route leads (spec: receptionist + CH; HO always)
const ROUTING_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'RECEPTIONIST', 'CENTRE_HEAD'];
const STAGE_ORDER = ['NEW_INQUIRY', 'FIRST_BUZZ', 'ROUTING', 'EXPERIENCE_SESSION', 'DISCOVERY_FLIGHT', 'OFFER', 'CONFIRMATION', 'ENROLLED', 'LOST'];

// Lead scoring: simple transparent weights (shown in UI as-is)
function computeScore(lead: { stage: string; inquiryChannel: string; experienceInterest: boolean; preferredUnit: string | null }) {
  const stageIdx = Math.max(0, STAGE_ORDER.indexOf(lead.stage));
  const channelBonus: Record<string, number> = { WALK_IN: 20, REFERRAL: 16, CALL: 10, WHATSAPP: 10, WEBSITE: 8, SOCIAL: 6, EVENT: 8 };
  let score = stageIdx * 11 + (channelBonus[lead.inquiryChannel] ?? 5);
  if (lead.experienceInterest) score += 8;
  if (lead.preferredUnit && lead.preferredUnit !== 'NO_PREFERENCE') score += 5;
  return Math.min(99, score);
}

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsCrmController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async nextInquiryNo(unitCode: string) {
    const prefix = `BB-${unitCode}-INQ-${AY_SHORT}-`;
    const last = await this.prisma.lead.findFirst({ where: { inquiryNo: { startsWith: prefix } }, orderBy: { inquiryNo: 'desc' } });
    const n = last ? parseInt(last.inquiryNo.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  // ── First Buzz Forms A & B + routing engine ──
  // Form A (hub/remote): areaLocality drives routing suggestion.
  // Form B (walk-in): unit auto-assigned to the receiving unit, channel WALK_IN.
  @Post()
  @Roles(...ROUTING_ROLES)
  async create(@Req() req: any, @Body() body: any) {
    const {
      formVersion, parentName, parentPhone, parentEmail, childName, childDob,
      programmeInterestId, areaLocality, preferredUnit, inquiryChannel,
      experienceInterest, sourceCampaign, notes, walkInUnitId,
    } = body;
    if (!parentName || !parentPhone) throw new BadRequestException('Parent name and phone are required');

    // ── Routing engine: area → suggested unit ──
    let suggestedUnitId: string | null = null;
    let routingBasis = 'none';
    if (formVersion === 'B') {
      // Walk-in: the unit they walked into IS the assignment basis
      suggestedUnitId = walkInUnitId || (HO_ROLES.includes(req.user.role) ? null : req.user.unitId);
      if (!suggestedUnitId) throw new BadRequestException('Walk-in form needs the receiving unit');
      routingBasis = 'walk-in';
    } else if (areaLocality) {
      const area = await this.prisma.areaMaster.findFirst({
        where: { isActive: true, locality: { equals: areaLocality, mode: 'insensitive' } },
      });
      if (area) { suggestedUnitId = area.suggestedUnitId; routingBasis = 'area-master'; }
    }
    // availability check: suggested unit must be ACTIVE, else drop suggestion
    if (suggestedUnitId) {
      const u = await this.prisma.unit.findUnique({ where: { id: suggestedUnitId } });
      if (!u || u.status !== 'ACTIVE') { suggestedUnitId = null; routingBasis = 'suggested-unit-unavailable'; }
    }
    // preference beats nothing: if no area match but parent prefers a unit, suggest it
    if (!suggestedUnitId && preferredUnit && preferredUnit !== 'NO_PREFERENCE') {
      const u = await this.prisma.unit.findFirst({ where: { code: preferredUnit, status: 'ACTIVE' } });
      if (u) { suggestedUnitId = u.id; routingBasis = 'parent-preference'; }
    }

    const sugUnit = suggestedUnitId ? await this.prisma.unit.findUnique({ where: { id: suggestedUnitId } }) : null;
    const inquiryNo = await this.nextInquiryNo(sugUnit?.code ?? 'HQ');
    const isWalkIn = formVersion === 'B';

    const lead = await this.prisma.lead.create({
      data: {
        inquiryNo,
        stage: isWalkIn ? 'FIRST_BUZZ' : 'NEW_INQUIRY',
        parentName, parentPhone, parentEmail: parentEmail || null,
        childName: childName || null,
        childDob: childDob ? new Date(childDob) : null,
        programmeInterestId: programmeInterestId || null,
        areaLocality: areaLocality || null,
        preferredUnit: preferredUnit || null,
        suggestedUnitId,
        // Walk-in auto-assigns immediately; Form A waits for receptionist confirm
        assignedUnitId: isWalkIn ? suggestedUnitId : null,
        inquiryChannel: isWalkIn ? 'WALK_IN' : (inquiryChannel || 'CALL'),
        experienceInterest: !!experienceInterest,
        sourceCampaign: sourceCampaign || null,
        notes: notes || null,
      },
    });
    const score = computeScore(lead as any);
    await this.prisma.lead.update({ where: { id: lead.id }, data: { leadScore: score } });
    await this.prisma.leadActivity.create({
      data: {
        leadId: lead.id, type: 'SYSTEM', byId: req.user.sub,
        note: `Inquiry created (Form ${isWalkIn ? 'B — walk-in' : 'A'})`,
        meta: { routingBasis, suggestedUnit: sugUnit?.code ?? null },
      },
    });
    await this.audit.log(req, 'leads', lead.id, 'INSERT', null, { inquiryNo, parentName, routingBasis });
    return { ...lead, leadScore: score, routingBasis, suggestedUnit: sugUnit };
  }

  @Get(':id')
  async detail(@Req() req: any, @Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        programmeInterest: true, suggestedUnit: true, assignedUnit: true,
        student: { select: { id: true, admissionNo: true, status: true } },
        activities: { orderBy: { createdAt: 'desc' }, include: { by: { select: { fullName: true, role: true } } } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    // unit-scope: non-HO users may only open leads assigned/suggested to their unit (or unassigned)
    if (!HO_ROLES.includes(req.user.role)) {
      const uid = req.user.unitId;
      if (lead.assignedUnitId && lead.assignedUnitId !== uid) throw new ForbiddenException('Lead belongs to another unit');
    }
    return lead;
  }

  // ── Stage transitions (board + list) ──
  @Post(':id/stage')
  @Roles(...ROUTING_ROLES)
  async setStage(@Req() req: any, @Param('id') id: string, @Body() body: { stage: string; note?: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!STAGE_ORDER.includes(body.stage)) throw new BadRequestException('Unknown stage');
    if (body.stage === 'LOST' && !body.note?.trim()) throw new BadRequestException('Marking a lead Lost requires a reason note');
    if (body.stage === 'ENROLLED') throw new BadRequestException('Enrolled is set automatically when admission is confirmed');

    const updated = await this.prisma.lead.update({ where: { id }, data: { stage: body.stage as any } });
    const score = computeScore(updated as any);
    await this.prisma.lead.update({ where: { id }, data: { leadScore: score } });
    await this.prisma.leadActivity.create({
      data: { leadId: id, type: 'STAGE_CHANGE', byId: req.user.sub, note: body.note || null, meta: { from: lead.stage, to: body.stage } },
    });
    await this.audit.log(req, 'leads', id, 'UPDATE', { stage: lead.stage }, { stage: body.stage });
    return { ...updated, leadScore: score };
  }

  // ── Routing confirm / override / re-route (note mandatory on override) ──
  @Post(':id/route')
  @Roles(...ROUTING_ROLES)
  async route(@Req() req: any, @Param('id') id: string, @Body() body: { unitId: string; note?: string }) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: { suggestedUnit: true, assignedUnit: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const target = await this.prisma.unit.findUnique({ where: { id: body.unitId } });
    if (!target) throw new BadRequestException('Unknown unit');
    const isOverride = lead.suggestedUnitId && body.unitId !== lead.suggestedUnitId;
    const isReroute = !!lead.assignedUnitId && lead.assignedUnitId !== body.unitId;
    if ((isOverride || isReroute) && !body.note?.trim()) {
      throw new BadRequestException(isReroute ? 'Re-routing requires a mandatory note' : 'Overriding the suggested unit requires a mandatory note');
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        assignedUnitId: body.unitId,
        routingNotes: body.note || lead.routingNotes,
        stage: STAGE_ORDER.indexOf(lead.stage) < STAGE_ORDER.indexOf('ROUTING') ? 'ROUTING' : lead.stage,
      },
      include: { assignedUnit: true, suggestedUnit: true },
    });
    await this.prisma.leadActivity.create({
      data: {
        leadId: id, type: 'ROUTING', byId: req.user.sub, note: body.note || null,
        meta: {
          from: lead.assignedUnit?.code ?? null, to: target.code,
          suggested: lead.suggestedUnit?.code ?? null,
          kind: isReroute ? 're-route' : isOverride ? 'override' : 'confirm',
        },
      },
    });
    await this.audit.log(req, 'leads', id, 'UPDATE', { assignedUnitId: lead.assignedUnitId }, { assignedUnitId: body.unitId, note: body.note });
    return updated;
  }

  // ── Free-form note on timeline ──
  @Post(':id/activities')
  async addNote(@Req() req: any, @Param('id') id: string, @Body() body: { note: string }) {
    if (!body.note?.trim()) throw new BadRequestException('Note is required');
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.leadActivity.create({
      data: { leadId: id, type: 'NOTE', note: body.note, byId: req.user.sub },
      include: { by: { select: { fullName: true, role: true } } },
    });
  }
}

// ─────────────────────────── AREA MASTER (HO-maintained lookup) ───────────────────────────
@Controller('areas')
@UseGuards(AuthGuard)
export class AreasController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  list() {
    return this.prisma.areaMaster.findMany({ include: { suggestedUnit: { select: { code: true, name: true } } }, orderBy: { locality: 'asc' } });
  }

  @Post()
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async create(@Req() req: any, @Body() body: any) {
    if (!body.locality || !body.suggestedUnitId) throw new BadRequestException('locality and suggestedUnitId are required');
    const area = await this.prisma.areaMaster.create({
      data: { locality: body.locality, pincode: body.pincode || null, suggestedUnitId: body.suggestedUnitId },
      include: { suggestedUnit: { select: { code: true, name: true } } },
    });
    await this.audit.log(req, 'area_master', area.id, 'INSERT', null, body);
    return area;
  }

  @Patch(':id')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const existing = await this.prisma.areaMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Area not found');
    const data: any = {};
    for (const k of ['locality', 'pincode', 'suggestedUnitId', 'isActive'] as const) if (body[k] !== undefined) data[k] = body[k];
    const updated = await this.prisma.areaMaster.update({ where: { id }, data, include: { suggestedUnit: { select: { code: true, name: true } } } });
    await this.audit.log(req, 'area_master', id, 'UPDATE', existing, updated);
    return updated;
  }
}

@Module({
  controllers: [LeadsCrmController, AreasController],
  providers: [PrismaService, AuditService],
})
export class CrmModule {}

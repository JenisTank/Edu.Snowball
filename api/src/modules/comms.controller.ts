import {
  Body, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';
import {
  DEFAULT_TEMPLATES, dispatchQueued, emailEnabled, extractVariables, notifyParent,
  pushEnabled, renderMessage, waEnabled,
} from './notify';

// ─────────────────────────────────────────────────────────────
// Communication Centre (Slice 7)
// Single outbox for every parent-facing message + HO Template Management.
// Delivery runs the fallback chain app push → WhatsApp → email (see notify.ts).
// With no credentials set the chain degrades to sandbox, so the whole
// pipeline stays click-testable before the BSP account exists.
// ─────────────────────────────────────────────────────────────

const ANNOUNCE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'];
const TEMPLATE_ROLES = ['FOUNDER', 'ACADEMIC_DIR']; // HO owns the wording

@Controller('comms')
@UseGuards(AuthGuard)
export class CommsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('messages')
  messages(@Req() req: any, @Query('type') type?: string, @Query('status') status?: string, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role) ? (unitId ? { unitId } : {}) : { unitId: req.user.unitId };
    return this.prisma.messageLog.findMany({
      where: { ...scope, ...(type ? { type } : {}), ...(status ? { status } : {}) },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' }, take: 300,
    });
  }

  @Get('summary')
  async summary(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const rows = await this.prisma.messageLog.groupBy({ by: ['type', 'status'], where: scope, _count: true });
    const byType: Record<string, number> = {}; const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byType[r.type] = (byType[r.type] ?? 0) + (r as any)._count;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + (r as any)._count;
    }
    const channels = { push: pushEnabled(), whatsapp: waEnabled(), email: emailEnabled() };
    return {
      byType, byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      channels,
      // Sandbox until at least one real channel is wired up.
      sandbox: !channels.push && !channels.whatsapp && !channels.email,
    };
  }

  // ── Broadcast an announcement to parents ──
  @Post('announce')
  @Roles(...ANNOUNCE_ROLES)
  async announce(@Req() req: any, @Body() b: { title: string; body: string; unitId?: string }) {
    if (!b.title?.trim() || !b.body?.trim()) throw new BadRequestException('Title and message are required');
    const scope = HO_ROLES.includes(req.user.role) ? (b.unitId ? { unitId: b.unitId } : {}) : { unitId: req.user.unitId };
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE', ...scope },
      select: { id: true, unitId: true, fatherPhone: true, motherPhone: true },
    });
    let queued = 0;
    const seen = new Set<string>();
    for (const s of students) {
      const phone = s.fatherPhone || s.motherPhone;
      if (!phone || seen.has(phone)) continue; // one message per family
      seen.add(phone);
      await notifyParent(this.prisma, {
        type: 'ANNOUNCEMENT', recipient: phone, studentId: s.id, unitId: s.unitId,
        payload: { title: b.title.trim(), body: b.body.trim(), by: req.user.name },
      });
      queued++;
    }
    await this.audit.log(req, 'message_logs', 'announcement', 'CREATE', null, { title: b.title, queued });
    return { ok: true, queued };
  }

  // ── Dispatch the outbox through the fallback chain ──
  @Post('dispatch')
  @Roles(...ANNOUNCE_ROLES)
  async dispatch(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const result = await dispatchQueued(this.prisma, scope);
    await this.audit.log(req, 'message_logs', 'dispatch', 'UPDATE', null, result);
    return { ok: true, ...result, sent: result.push + result.whatsapp + result.email + result.sandbox };
  }

  // ═════════════ HO Template Management (spec B2) ═════════════

  @Get('templates')
  async templates() {
    const rows = await this.prisma.messageTemplate.findMany({ orderBy: { code: 'asc' } });
    const existing = new Set(rows.map(r => r.code));
    // Any built-in type that has not been customised yet is shown as a
    // read-only default, so HO always sees the full message inventory.
    const defaults = Object.entries(DEFAULT_TEMPLATES)
      .filter(([code]) => !existing.has(code))
      .map(([code, t]) => ({
        id: null, code, name: t.name, category: t.category, channel: 'WHATSAPP', language: 'en',
        body: t.body, variables: extractVariables(t.body), status: 'DRAFT', bspName: null,
        locked: true, isActive: true, builtIn: true,
      }));
    return [...rows.map(r => ({ ...r, builtIn: false })), ...defaults];
  }

  @Post('templates')
  @Roles(...TEMPLATE_ROLES)
  async upsertTemplate(@Req() req: any, @Body() b: { code: string; name?: string; body: string; category?: string; channel?: string; language?: string; bspName?: string; status?: string; isActive?: boolean }) {
    if (!b?.code?.trim() || !b?.body?.trim()) throw new BadRequestException('Template code and body are required');
    const code = b.code.trim().toUpperCase();
    const data = {
      name: b.name?.trim() || DEFAULT_TEMPLATES[code]?.name || code,
      body: b.body.trim(),
      variables: extractVariables(b.body),
      category: b.category ?? DEFAULT_TEMPLATES[code]?.category ?? 'UTILITY',
      channel: b.channel ?? 'WHATSAPP',
      language: b.language ?? 'en',
      bspName: b.bspName?.trim() || null,
      status: (b.status as any) ?? 'DRAFT',
      isActive: b.isActive ?? true,
      updatedById: req.user.sub,
    };
    const before = await this.prisma.messageTemplate.findUnique({ where: { code } });
    const tpl = await this.prisma.messageTemplate.upsert({ where: { code }, create: { code, ...data }, update: data });
    await this.audit.log(req, 'message_templates', tpl.id, before ? 'UPDATE' : 'CREATE', before, tpl);
    return tpl;
  }

  // Mark a template as submitted to / approved by the BSP.
  @Patch('templates/:code/status')
  @Roles(...TEMPLATE_ROLES)
  async templateStatus(@Req() req: any, @Param('code') code: string, @Body() b: { status: string; bspName?: string }) {
    const allowed = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
    if (!allowed.includes(b?.status)) throw new BadRequestException(`status must be one of ${allowed.join(', ')}`);
    const before = await this.prisma.messageTemplate.findUnique({ where: { code: code.toUpperCase() } });
    if (!before) throw new NotFoundException('Save the template before changing its approval status');
    const tpl = await this.prisma.messageTemplate.update({
      where: { code: code.toUpperCase() },
      data: { status: b.status as any, bspName: b.bspName?.trim() || before.bspName, updatedById: req.user.sub },
    });
    await this.audit.log(req, 'message_templates', tpl.id, 'UPDATE', before, tpl);
    return tpl;
  }

  // Live preview with sample values — what a parent would actually receive.
  @Post('templates/preview')
  async preview(@Body() b: { code?: string; body?: string; vars?: Record<string, any> }) {
    const sample = {
      parent: 'Rajesh Patel', child: 'Aarav Patel', date: new Date().toLocaleDateString('en-IN'),
      batch: 'K1 Morning Gujarati', amount: '₹18,000', amountDue: '₹18,000', instalmentNo: '2',
      dueDate: '10 Jul 2026', receiptNo: 'BB-U1-RCPT-2627-0007', days: '3', lastDate: '04 Oct 2026',
      phone: '+91 91000 00000', unit: 'Unit 1 – Saraswati',
      // {title}/{body} only make sense for announcements
      ...(b.code === 'ANNOUNCEMENT' || b.body?.includes('{title}')
        ? { title: 'Diwali break', body: 'The centre is closed 20–24 Oct.' } : {}),
      ...(b.vars ?? {}),
    };
    if (b.body) {
      return { text: b.body.replace(/\{(\w+)\}/g, (_m, k) => (sample as any)[k] ?? `{${k}}`), variables: extractVariables(b.body) };
    }
    if (!b.code) throw new BadRequestException('Provide a template code or body');
    const r = await renderMessage(this.prisma, b.code.toUpperCase(), sample);
    return { text: r.body, title: r.title, approved: r.approved };
  }

  // ═════════════ Parent ↔ Centre Head threads (staff side) ═════════════

  @Get('threads')
  async threads(@Req() req: any, @Query('unitId') unitId?: string) {
    const scope = HO_ROLES.includes(req.user.role) ? (unitId ? { unitId } : {}) : { unitId: req.user.unitId };
    const rows = await this.prisma.parentMessage.findMany({
      where: scope,
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, unitId: true } } },
      orderBy: { createdAt: 'desc' }, take: 400,
    });
    // Collapse to one row per child, newest first, with an unread counter.
    const byChild = new Map<string, any>();
    for (const m of rows) {
      const k = m.studentId;
      if (!byChild.has(k)) {
        byChild.set(k, { studentId: k, student: m.student, last: m, unread: 0, count: 0 });
      }
      const t = byChild.get(k);
      t.count++;
      if (m.direction === 'PARENT_TO_CENTRE' && !m.readAt) t.unread++;
    }
    return Array.from(byChild.values());
  }

  @Get('threads/:studentId')
  async thread(@Req() req: any, @Param('studentId') studentId: string) {
    const s = await this.prisma.student.findUnique({ where: { id: studentId }, select: { unitId: true, firstName: true, lastName: true, admissionNo: true } });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');
    const messages = await this.prisma.parentMessage.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } });
    await this.prisma.parentMessage.updateMany({
      where: { studentId, direction: 'PARENT_TO_CENTRE', readAt: null },
      data: { readAt: new Date() },
    });
    return { student: s, messages };
  }

  @Post('threads/:studentId/reply')
  async reply(@Req() req: any, @Param('studentId') studentId: string, @Body() b: { body: string }) {
    if (!b?.body?.trim()) throw new BadRequestException('Message cannot be empty');
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { unit: { select: { name: true } } },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');

    const msg = await this.prisma.parentMessage.create({
      data: {
        studentId, unitId: s.unitId, direction: 'CENTRE_TO_PARENT',
        body: b.body.trim(), authorName: req.user.name ?? 'Centre', authorId: req.user.sub,
      },
    });
    // Nudge the parent (push now, WhatsApp/email on dispatch).
    const phone = s.fatherPhone || s.motherPhone;
    if (phone) {
      await notifyParent(this.prisma, {
        type: 'PARENT_REPLY', recipient: phone, studentId, unitId: s.unitId,
        payload: { child: s.firstName, unit: s.unit.name, preview: b.body.trim().slice(0, 80) },
      });
    }
    await this.audit.log(req, 'parent_messages', msg.id, 'CREATE', null, msg);
    return msg;
  }
}

@Module({ controllers: [CommsController], providers: [PrismaService, AuditService] })
export class CommsModule {}

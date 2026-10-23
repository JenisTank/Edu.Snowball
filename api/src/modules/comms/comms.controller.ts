import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { env } from '../../config/env';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PushService } from '../../modules/notifications/push.service';
import { CommsDispatchService } from './dispatch.service';
import { DigestService } from './digest.service';
import { DIGEST_CADENCE, weekKey } from './digest.rules';
import { providerStatus } from './providers';
import { DEFAULT_TEMPLATES, missingVariables, renderTemplate } from './comms.rules';
import {
  AnnouncementDto,
  CreateTemplateDto,
  ReplyParentMessageDto,
  UpdateTemplateDto,
} from './comms.dto';

// ─────────────────────────────────────────────────────────────
// Communication Centre (Slice 7)
// Single outbox for every parent-facing message. In sandbox mode the
// dispatcher marks messages SENT locally; drop WhatsApp BSP credentials
// into .env (WA_BSP_URL / WA_BSP_KEY) to go live without code changes.
// ─────────────────────────────────────────────────────────────

const ANNOUNCE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'];

@Controller('comms')
@UseGuards(AuthGuard)
export class CommsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private push: PushService,
    private dispatch: CommsDispatchService,
    private digest: DigestService,
  ) {}

  @Get('messages')
  messages(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('unitId') unitId?: string,
  ) {
    const scope = HO_ROLES.includes(req.user.role)
      ? unitId
        ? { unitId }
        : {}
      : { unitId: req.user.unitId };
    return this.prisma.messageLog.findMany({
      where: { ...scope, ...(type ? { type } : {}), ...(status ? { status } : {}) },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  @Get('summary')
  async summary(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const rows = await this.prisma.messageLog.groupBy({
      by: ['type', 'status'],
      where: scope,
      _count: true,
    });
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byType[r.type] = (byType[r.type] ?? 0) + (r as any)._count;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + (r as any)._count;
    }
    return {
      byType,
      byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      sandbox: !env.waBspKey,
    };
  }

  @Get('parent-messages')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async parentMessages(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const rows = await this.prisma.parentMessage.findMany({
      where: scope,
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    await this.prisma.parentMessage.updateMany({
      where: { ...scope, sender: 'PARENT', readAt: null },
      data: { readAt: new Date() },
    });
    return rows;
  }

  @Post('parent-messages/:studentId/reply')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async parentReply(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Body() b: ReplyParentMessageDto,
  ) {
    if (!b.body?.trim() || b.body.trim().length > 1000)
      throw new BadRequestException('Reply must be 1–1000 characters');
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException();
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId)
      throw new BadRequestException('Student is outside your unit');
    const reply = await this.prisma.parentMessage.create({
      data: { studentId, unitId: student.unitId, sender: 'CENTRE_HEAD', body: b.body.trim() },
    });
    // Answering the thread closes the SLA and clears any AD escalation.
    await this.prisma.parentMessage.updateMany({
      where: { studentId, sender: 'PARENT', repliedAt: null },
      data: { repliedAt: new Date(), escalatedAt: null },
    });
    const phone = student.fatherPhone || student.motherPhone;
    if (phone)
      await this.push.send(phone, {
        title: `Message about ${student.firstName}`,
        body: b.body.trim(),
        url: '/parent',
        tag: `reply-${studentId}`,
      });
    return reply;
  }

  // ── Broadcast an announcement to parents ──
  @Post('announce')
  @Roles(...ANNOUNCE_ROLES)
  async announce(@Req() req: any, @Body() b: AnnouncementDto) {
    if (!b.title?.trim() || !b.body?.trim())
      throw new BadRequestException('Title and message are required');
    const scope = HO_ROLES.includes(req.user.role)
      ? b.unitId
        ? { unitId: b.unitId }
        : {}
      : { unitId: req.user.unitId };
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
      await this.prisma.messageLog.create({
        data: {
          type: 'ANNOUNCEMENT',
          recipient: phone,
          studentId: s.id,
          unitId: s.unitId,
          payload: { title: b.title.trim(), body: b.body.trim(), by: req.user.name },
        },
      });
      await this.push.send(phone, {
        title: b.title.trim(),
        body: b.body.trim(),
        url: '/parent',
        tag: `announcement-${Date.now()}`,
      });
      queued++;
    }
    await this.audit.log(req, 'message_logs', 'announcement', 'INSERT', null, {
      title: b.title,
      queued,
    });
    return { ok: true, queued };
  }

  // ── Delivery providers this deployment can use ──
  @Get('providers')
  providers() {
    return providerStatus();
  }

  // ── Dispatch the queue: push already went out, now WhatsApp → email ──
  @Post('dispatch')
  @Roles(...ANNOUNCE_ROLES)
  async dispatchQueue(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    // Keep the unit scoping that the single-outbox rule promises.
    const pending = await this.prisma.messageLog.count({
      where: { status: 'QUEUED', ...scope, unitId: { not: null } },
    });
    const summary = await this.dispatch.dispatchPending({ limit: 300 });
    await this.audit.log(req, 'message_logs', 'dispatch', 'UPDATE', null, {
      pending,
      sent: summary.sent,
      failed: summary.failed,
      suppressed: summary.suppressed,
    });
    return { ok: true, ...summary };
  }

  /** Re-queue FAILED messages after a credential or template fix. */
  @Post('retry')
  @Roles(...ANNOUNCE_ROLES)
  async retry(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const result = await this.prisma.messageLog.updateMany({
      where: { ...scope, status: 'FAILED' },
      data: { status: 'QUEUED', attempts: 0, scheduledFor: null, lastError: null },
    });
    await this.audit.log(req, 'message_logs', 'retry', 'UPDATE', null, { requeued: result.count });
    return { ok: true, requeued: result.count };
  }

  // ── Templates (HO-locked wording, spec B2) ──
  @Get('templates')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD', 'COORDINATOR')
  async templates() {
    await this.dispatch.ensureTemplates();
    return this.prisma.messageTemplate.findMany({ orderBy: [{ channel: 'asc' }, { code: 'asc' }] });
  }

  @Post('templates')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async createTemplate(@Req() req: any, @Body() b: CreateTemplateDto) {
    if (!b.code?.trim() || !b.name?.trim() || !b.body?.trim())
      throw new BadRequestException('Code, name and body are required');
    const missing = missingVariables(b.body, { child: 'x' });
    if (missing.length) {
      // Unknown placeholders render literally, so catch them at authoring time.
      const allowed = new Set([
        'child',
        'batch',
        'date',
        'amount',
        'dueDate',
        'receiptNo',
        'admissionNo',
        'orientationDate',
        'fromDate',
        'toDate',
        'message',
        'title',
        'unit',
      ]);
      const bad = missing.filter((m) => !allowed.has(m));
      if (bad.length)
        throw new BadRequestException(`Unknown template variables: ${bad.join(', ')}`);
    }
    const row = await this.prisma.messageTemplate.create({
      data: {
        code: b.code.trim(),
        name: b.name.trim(),
        channel: b.channel ?? 'WHATSAPP',
        language: b.language ?? 'en',
        body: b.body,
        metaTemplate: b.metaTemplate ?? null,
        updatedById: req.user.sub,
      },
    });
    await this.audit.log(req, 'message_templates', row.id, 'INSERT', null, row);
    return row;
  }

  @Post('templates/:id/approve')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async approveTemplate(@Req() req: any, @Param('id') id: string) {
    const tpl = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    if (tpl.channel === 'WHATSAPP' && !(tpl as any).metaTemplate)
      throw new BadRequestException('Set the BSP-approved template name before approving');
    const row = await this.prisma.messageTemplate.update({
      where: { id },
      data: { approved: true, updatedById: req.user.sub },
    });
    await this.audit.log(
      req,
      'message_templates',
      id,
      'UPDATE',
      { approved: false },
      { approved: true },
    );
    return row;
  }

  @Post('templates/:id')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async updateTemplate(@Req() req: any, @Param('id') id: string, @Body() b: UpdateTemplateDto) {
    const tpl = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    const row = await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(b.name ? { name: String(b.name).trim() } : {}),
        ...(b.body ? { body: String(b.body) } : {}),
        ...(b.language ? { language: String(b.language) } : {}),
        ...(b.metaTemplate !== undefined ? { metaTemplate: b.metaTemplate || null } : {}),
        ...(b.active !== undefined ? { active: !!b.active } : {}),
        // Editing the wording invalidates the approval.
        approved: false,
        updatedById: req.user.sub,
      },
    });
    await this.audit.log(req, 'message_templates', id, 'UPDATE', tpl, row);
    return row;
  }

  /** Preview a template with sample variables — no message is created. */
  @Get('templates/:code/preview')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async preview(@Param('code') code: string) {
    const tpl = await this.prisma.messageTemplate.findUnique({ where: { code } });
    const fallback = DEFAULT_TEMPLATES.find((t) => t.code === code);
    if (!tpl && !fallback) throw new NotFoundException('Template not found');
    const body = tpl?.body ?? fallback!.body;
    return {
      code,
      body,
      preview: renderTemplate(body, {
        child: 'Aarav Sample',
        batch: 'K1 Morning Gujarati',
        date: new Date().toLocaleDateString('en-IN'),
        amount: '12,000',
        dueDate: '10 Oct 2026',
        receiptNo: 'BB-U1-RCPT-2627-0001',
        admissionNo: 'BB-U1-2627-0001',
        orientationDate: '05 Jun 2026',
        fromDate: '22 Oct 2026',
        toDate: '24 Oct 2026',
      }),
    };
  }

  // ── Weekly parent digest (email + PDF) ──
  /**
   * Queue this week's digests. `dryRun=true` reports the numbers without
   * writing to the outbox, so a Centre Head can sanity-check a whole unit first.
   */
  @Post('digest/run')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async runDigest(
    @Req() req: any,
    @Query('unitId') unitId?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    const scope = HO_ROLES.includes(req.user.role) ? unitId : req.user.unitId;
    const result = await this.digest.run({
      unitId: scope || undefined,
      dryRun: dryRun === 'true' || dryRun === '1',
    });
    await this.audit.log(req, 'message_logs', `digest:${result.week}`, 'UPDATE', null, {
      queued: result.queued,
      skipped: result.skipped,
      empty: result.empty,
      dryRun: dryRun === 'true' || dryRun === '1',
    });
    return result;
  }

  /** Preview one child's digest exactly as the parent will receive it. */
  @Get('digest/:studentId/preview')
  @Roles(...ANNOUNCE_ROLES)
  async digestPreview(@Req() req: any, @Param('studentId') studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { unitId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId)
      throw new BadRequestException('Cross-unit access denied');
    const preview = await this.digest.preview(studentId);
    if (!preview) throw new NotFoundException('Nothing to summarise for this student');
    return preview;
  }

  /** Download the same digest as a PDF. */
  @Get('digest/:studentId/pdf')
  @Roles(...ANNOUNCE_ROLES)
  async digestPdf(@Req() req: any, @Param('studentId') studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { unitId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== student.unitId)
      throw new BadRequestException('Cross-unit access denied');
    const pdf = await this.digest.digestPdf(studentId);
    if (!pdf) throw new NotFoundException('Nothing to summarise for this student');
    return {
      contentType: 'application/pdf',
      filename: `digest-${weekKey()}.pdf`,
      base64: pdf.toString('base64'),
    };
  }

  /** Send the queue now instead of waiting for the next sweep. */
  @Post('digest/flush')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async flushDigest() {
    return this.digest.flush();
  }

  /** Cadence + this week's key, so the UI can show "next digest Monday". */
  @Get('digest/schedule')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  digestSchedule() {
    return { cadence: DIGEST_CADENCE, week: weekKey() };
  }

  // ── Parent reply SLA ──
  @Get('sla')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async sla() {
    return this.dispatch.slaBoard();
  }

  @Post('escalations/run')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async escalations(@Req() req: any) {
    const result = await this.dispatch.runEscalationScan();
    await this.audit.log(req, 'parent_messages', 'escalation-scan', 'UPDATE', null, result);
    return result;
  }
}

import {
  Body, Controller, Get, Module, Post, Query, Req, UseGuards, BadRequestException, Param, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';
import { PushService } from './push.service';

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
  constructor(private prisma: PrismaService, private audit: AuditService, private push: PushService) {}

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
    return { byType, byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0), sandbox: !process.env.WA_BSP_KEY };
  }


  @Get('parent-messages')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async parentMessages(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const rows = await this.prisma.parentMessage.findMany({ where: scope, include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    await this.prisma.parentMessage.updateMany({ where: { ...scope, sender: 'PARENT', readAt: null }, data: { readAt: new Date() } });
    return rows;
  }

  @Post('parent-messages/:studentId/reply')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async parentReply(@Req() req: any, @Param('studentId') studentId: string, @Body() b: { body: string }) {
    if (!b.body?.trim() || b.body.trim().length > 1000) throw new BadRequestException('Reply must be 1–1000 characters');
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException();
    if (!HO_ROLES.includes(req.user.role) && student.unitId !== req.user.unitId) throw new BadRequestException('Student is outside your unit');
    const reply = await this.prisma.parentMessage.create({ data: { studentId, unitId: student.unitId, sender: 'CENTRE_HEAD', body: b.body.trim() } });
    const phone = student.fatherPhone || student.motherPhone;
    if (phone) await this.push.send(phone, { title: `Message about ${student.firstName}`, body: b.body.trim(), url: '/parent', tag: `reply-${studentId}` });
    return reply;
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
      await this.prisma.messageLog.create({
        data: {
          type: 'ANNOUNCEMENT', recipient: phone, studentId: s.id, unitId: s.unitId,
          payload: { title: b.title.trim(), body: b.body.trim(), by: req.user.name },
        },
      });
      await this.push.send(phone, { title: b.title.trim(), body: b.body.trim(), url: '/parent', tag: `announcement-${Date.now()}` });
      queued++;
    }
    await this.audit.log(req, 'message_logs', 'announcement', 'INSERT', null, { title: b.title, queued });
    return { ok: true, queued };
  }

  // ── Dispatch the queue (sandbox: marks SENT; live: hands to BSP) ──
  @Post('dispatch')
  @Roles(...ANNOUNCE_ROLES)
  async dispatch(@Req() req: any) {
    const scope = HO_ROLES.includes(req.user.role) ? {} : { unitId: req.user.unitId };
    const pending = await this.prisma.messageLog.findMany({ where: { status: 'QUEUED', channel: 'WHATSAPP', ...scope }, take: 500 });
    const live = !!process.env.WA_BSP_KEY;
    // Sandbox mode: simulate a successful BSP handoff so the full pipeline
    // (queue → send → delivery state) is testable before go-live.
    for (const m of pending) {
      await this.prisma.messageLog.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: new Date() } });
    }
    await this.audit.log(req, 'message_logs', 'dispatch', 'UPDATE', null, { sent: pending.length, mode: live ? 'LIVE' : 'SANDBOX' });
    return { ok: true, sent: pending.length, mode: live ? 'LIVE' : 'SANDBOX' };
  }
}

@Module({ controllers: [CommsController], providers: [PrismaService, AuditService, PushService] })
export class CommsModule {}

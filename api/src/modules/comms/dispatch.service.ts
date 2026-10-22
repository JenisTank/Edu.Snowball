import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';
import { sendWebPush } from '../notifications/push.service';
import {
  DEFAULT_TEMPLATES,
  MAX_ATTEMPTS,
  channelPlan,
  renderTemplate,
  retryDelay,
  shouldEscalate,
} from './comms.rules';
import {
  emailConfigured,
  providerStatus,
  sendEmail,
  sendWhatsApp,
  whatsappConfigured,
} from './providers';

/**
 * Outbox dispatcher.
 *
 * One place decides how a message leaves the building:
 *   push (already sent at enqueue time) → WhatsApp → email → SUPPRESSED.
 *
 * The delivery state lives on the message row (`attempts`, `lastError`,
 * `deliveredVia`), so the Communication Centre can show exactly what happened
 * to every message without a second log table.
 */

const log = new Logger('Comms');

/** Message type → template code. */
export const TEMPLATE_BY_TYPE: Record<string, string> = {
  ABSENCE_ALERT: 'absence_alert',
  ESCALATION_3DAY: 'escalation_3day',
  FEE_REMINDER: 'fee_reminder',
  RECEIPT: 'receipt',
  ADMISSION_CONFIRMATION: 'admission_confirmation',
  LEAVE_APPROVED: 'leave_approved',
  LEAVE_REJECTED: 'leave_approved',
  TEACHER_NOT_MARKED: 'unmarked_register',
};

export interface DispatchSummary {
  attempted: number;
  sent: number;
  failed: number;
  suppressed: number;
  byChannel: Record<string, number>;
  mode: ReturnType<typeof providerStatus>;
}

@Injectable()
export class CommsDispatchService {
  constructor(private prisma: PrismaService) {}

  /** Seed the HO-locked templates once; never overwrite an edited body. */
  async ensureTemplates() {
    for (const t of DEFAULT_TEMPLATES) {
      await this.prisma.messageTemplate
        .upsert({
          where: { code: t.code },
          update: {}, // HO wording wins over the seed
          create: {
            code: t.code,
            name: t.name,
            channel: t.channel,
            language: t.language,
            body: t.body,
            metaTemplate: t.metaTemplate ?? null,
          },
        })
        .catch(() => null);
    }
  }

  private async templateFor(type: string) {
    const code = TEMPLATE_BY_TYPE[type];
    if (!code) return null;
    return this.prisma.messageTemplate.findUnique({ where: { code } }).catch(() => null);
  }

  /**
   * Dispatch one queued message.
   *
   * Push is not repeated here: callers already fire it at enqueue time, and
   * duplicating a lock-screen notification for the same absence is worse than
   * a missed channel.
   */
  async dispatchOne(message: any, opts: { dryRun?: boolean } = {}) {
    const student = message.studentId
      ? await this.prisma.student
          .findUnique({
            where: { id: message.studentId },
            select: {
              firstName: true,
              lastName: true,
              guardianEmail: true,
              fatherPhone: true,
              motherPhone: true,
            },
          })
          .catch(() => null)
      : null;

    const tpl = await this.templateFor(message.type);
    const payload: any = message.payload ?? {};
    const vars: Record<string, unknown> = {
      child: student ? `${student.firstName} ${student.lastName}`.trim() : undefined,
      phone: message.recipient,
      ...payload,
    };
    const body = tpl
      ? renderTemplate(tpl.body, vars)
      : (payload.message ?? payload.body ?? payload.title ?? '');
    const text = String(body || '').trim();

    const [pushSubs, exists] = await Promise.all([
      this.prisma.pushSubscription
        .count({ where: { phone: String(message.recipient).replace(/[\s-]/g, '') } })
        .catch(() => 0),
      this.prisma.messageLog.findUnique({ where: { id: message.id } }).catch(() => null),
    ]);
    const target = exists ?? message;

    const plan = channelPlan(message.type, {
      hasPush: pushSubs > 0,
      hasWhatsApp: !!message.recipient,
      hasEmail: !!student?.guardianEmail,
    })
      // Push already went out at enqueue time.
      .filter((c) => c !== 'PUSH');

    if (!plan.length) {
      await this.prisma.messageLog.update({
        where: { id: message.id },
        data: {
          status: 'SUPPRESSED',
          lastError: 'No delivery channel available (no BSP, no email on file)',
        },
      });
      return { ok: false, status: 'SUPPRESSED' as const };
    }

    if (opts.dryRun) return { ok: true, status: 'DRY_RUN' as const, plan, text };

    let lastError: string | undefined;
    for (const channel of plan) {
      const result =
        channel === 'WHATSAPP'
          ? await sendWhatsApp({
              phone: message.recipient,
              text,
              template:
                tpl?.metaTemplate && tpl.approved
                  ? {
                      name: tpl.metaTemplate,
                      language: tpl.language,
                      variables: Object.values(payload).map((v) => String(v ?? '')),
                    }
                  : undefined,
            })
          : await sendEmail({
              email: student?.guardianEmail ?? null,
              text,
              subject: `BumbleB Kidz · ${message.type.replace(/_/g, ' ').toLowerCase()}`,
            });

      if (result.ok) {
        await this.prisma.messageLog.update({
          where: { id: message.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            attempts: (target.attempts ?? 0) + 1,
            deliveredVia: result.via,
            lastError: null,
            templateCode: tpl?.code ?? null,
          },
        });
        return { ok: true, status: 'SENT' as const, via: result.via };
      }
      lastError = result.error;
      log.warn(`message ${message.id} via ${channel} failed: ${result.error}`);
    }

    const attempts = (target.attempts ?? 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await this.prisma.messageLog.update({
      where: { id: message.id },
      data: {
        status: exhausted ? 'FAILED' : 'QUEUED',
        attempts,
        lastError: lastError ?? 'All channels failed',
        scheduledFor: exhausted ? null : new Date(Date.now() + retryDelay(attempts)),
        templateCode: tpl?.code ?? null,
      },
    });
    return {
      ok: false,
      status: exhausted ? ('FAILED' as const) : ('RETRY' as const),
      error: lastError,
    };
  }

  /** Drain the queue (manual button, cron, or a webhook after a template lands). */
  async dispatchPending(opts: { limit?: number } = {}): Promise<DispatchSummary> {
    const pending = await this.prisma.messageLog.findMany({
      where: {
        status: 'QUEUED',
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      take: opts.limit ?? 200,
    });

    const summary: DispatchSummary = {
      attempted: pending.length,
      sent: 0,
      failed: 0,
      suppressed: 0,
      byChannel: {},
      mode: providerStatus(),
    };

    for (const m of pending) {
      const res = await this.dispatchOne(m);
      if (res.status === 'SENT') {
        summary.sent += 1;
        const via = (res as any).via ?? 'UNKNOWN';
        summary.byChannel[via] = (summary.byChannel[via] ?? 0) + 1;
      } else if (res.status === 'FAILED') summary.failed += 1;
      else if (res.status === 'SUPPRESSED') summary.suppressed += 1;
    }
    return summary;
  }

  /**
   * AD escalation: a parent message left unanswered past the SLA.
   *
   * The clock only runs in business hours, so a 21:00 message is not "late" at
   * 01:00. Each thread is escalated once; a CH reply clears the flag.
   */
  async runEscalationScan(now: Date = new Date()) {
    const open = await this.prisma.parentMessage.findMany({
      where: { sender: 'PARENT', escalatedAt: null },
      include: {
        student: {
          select: { firstName: true, lastName: true, admissionNo: true, unitId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let escalated = 0;
    for (const m of open) {
      // A later CH reply in the same thread means it was answered.
      const reply = await this.prisma.parentMessage.findFirst({
        where: { studentId: m.studentId, sender: 'CENTRE_HEAD', createdAt: { gt: m.createdAt } },
        select: { id: true },
      });
      if (
        !shouldEscalate({
          createdAt: m.createdAt,
          now,
          replied: !!reply,
          alreadyEscalated: !!m.escalatedAt,
        })
      )
        continue;

      await this.prisma.parentMessage.update({
        where: { id: m.id },
        data: { escalatedAt: now },
      });
      await this.prisma.messageLog.create({
        data: {
          type: 'PARENT_ESCALATION',
          channel: 'INTERNAL',
          recipient: 'ACADEMIC_DIR',
          studentId: m.studentId,
          unitId: m.student.unitId,
          payload: {
            child: `${m.student.firstName} ${m.student.lastName}`,
            admissionNo: m.student.admissionNo,
            message: m.body.slice(0, 200),
            waitingSince: m.createdAt,
            slaHours: 4,
          },
        },
      });
      escalated += 1;
    }
    return { checked: open.length, escalated };
  }

  /** Parent threads and their SLA state, for the Communication Centre. */
  async slaBoard(now: Date = new Date()) {
    const messages = await this.prisma.parentMessage.findMany({
      where: { sender: 'PARENT' },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true, unitId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const rows: {
      id: string;
      studentId: string;
      child: string;
      admissionNo: string;
      body: string;
      createdAt: Date;
      ageHours: number;
      replied: boolean;
      repliedAt: Date | null;
      escalatedAt: Date | null;
      breached: boolean;
    }[] = [];
    for (const m of messages) {
      const reply = await this.prisma.parentMessage.findFirst({
        where: { studentId: m.studentId, sender: 'CENTRE_HEAD', createdAt: { gt: m.createdAt } },
        select: { createdAt: true, body: true },
      });
      const ageHours =
        Math.round(((now.getTime() - new Date(m.createdAt).getTime()) / 3_600_000) * 10) / 10;
      rows.push({
        id: m.id,
        studentId: m.studentId,
        child: `${m.student.firstName} ${m.student.lastName}`,
        admissionNo: m.student.admissionNo,
        body: m.body,
        createdAt: m.createdAt,
        ageHours,
        replied: !!reply,
        repliedAt: reply?.createdAt ?? null,
        escalatedAt: m.escalatedAt,
        breached: !reply && shouldEscalate({ createdAt: m.createdAt, now }),
      });
    }
    return {
      rows,
      open: rows.filter((r) => !r.replied).length,
      breached: rows.filter((r) => r.breached).length,
      escalated: rows.filter((r) => r.escalatedAt).length,
    };
  }
}

/** Cron-side entry point used by the scheduler tick. */
export async function runCommsSweep(prisma: any, now: Date = new Date()) {
  const dispatch = new CommsDispatchService(prisma);
  const escalated = await dispatch
    .runEscalationScan(now)
    .catch(() => ({ checked: 0, escalated: 0 }));
  const sent =
    whatsappConfigured() || emailConfigured()
      ? await dispatch.dispatchPending({ limit: 100 }).catch(() => null)
      : null;
  return { ...escalated, dispatched: sent };
}

export { sendWebPush };

// ─────────────────────────────────────────────────────────────
// Notification dispatcher (Slice 7)
//
// ONE outbox (message_logs) + a fallback chain per the spec:
//     1. app push  (parent PWA web-push — free, instant, no BSP needed)
//     2. WhatsApp  (BSP: AiSensy / Interakt / Gupshup — needs WA_BSP_KEY)
//     3. email     (SMTP — receipts & certificates)
//
// Every attempt is logged on the message row (payload.delivery), so the
// Communication Centre shows exactly which channel actually reached the parent.
// With no credentials configured the whole chain degrades to SANDBOX: messages
// are marked SENT locally so the pipeline stays testable before go-live.
// ─────────────────────────────────────────────────────────────
import { PrismaService } from '../prisma.service';

export const normPhone = (p?: string | null) => (p ?? '').replace(/[\s-]/g, '');

export const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const waEnabled = () => !!process.env.WA_BSP_KEY;
export const emailEnabled = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER);

// ── Built-in wording. The HO Template Management screen overrides these
//    from the message_templates table; these are the safety net. ──
export const DEFAULT_TEMPLATES: Record<string, { name: string; category: string; body: string }> = {
  ABSENCE_ALERT: { name: 'Absence alert', category: 'UTILITY', body: 'Namaste {parent}, {child} has been marked absent today ({date}) for {batch}. If this is unexpected, please call your centre.' },
  ADMIN_CALL: { name: 'No-response call task', category: 'SERVICE', body: 'Follow-up needed: {child} is still marked absent and the parent has not responded. Please call {phone}.' },
  ESCALATION_3DAY: { name: '3-day absence escalation', category: 'SERVICE', body: '{child} has been absent {days} days in a row (last {lastDate}). Centre Head follow-up required.' },
  FEE_REMINDER: { name: 'Fee reminder', category: 'UTILITY', body: 'Namaste, instalment {instalmentNo} of {amountDue} for {child} is due on {dueDate}. Pay at the centre or through the parent app.' },
  RECEIPT: { name: 'Fee receipt', category: 'UTILITY', body: 'Thank you! We have received {amount} for {child}. Receipt {receiptNo} is available in the parent app.' },
  ANNOUNCEMENT: { name: 'Announcement', category: 'UTILITY', body: '{title}\n\n{body}' },
  PARENT_REPLY: { name: 'Reply from the centre', category: 'SERVICE', body: 'You have a new message from {unit} about {child}. Open the parent app to read and reply.' },
};

export function fillTemplate(body: string, vars: Record<string, any>) {
  return body.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? '').toString());
}

export function extractVariables(body: string) {
  return Array.from(new Set(Array.from(body.matchAll(/\{(\w+)\}/g)).map(m => m[1])));
}

// Resolve the wording for a message type: HO template first, built-in second.
export async function renderMessage(prisma: PrismaService, type: string, payload: any) {
  const tpl = await prisma.messageTemplate.findUnique({ where: { code: type } }).catch(() => null);
  const body = tpl?.isActive ? tpl.body : DEFAULT_TEMPLATES[type]?.body ?? '';
  const title = payload?.title ?? tpl?.name ?? DEFAULT_TEMPLATES[type]?.name ?? 'BumbleB Kidz';
  return { title, body: fillTemplate(body, payload ?? {}), bspName: tpl?.bspName ?? null, approved: tpl?.status === 'APPROVED' };
}

// ── Channel 1: web push to every device this parent has registered ──
export async function sendPush(prisma: PrismaService, phone: string, note: { title: string; body: string; url?: string; tag?: string }) {
  if (!pushEnabled()) return { ok: false, reason: 'push not configured' };
  const subs = await prisma.pushSubscription.findMany({ where: { phone: normPhone(phone) } });
  if (!subs.length) return { ok: false, reason: 'no subscription' };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webpush = require('web-push');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:hello@bumblebkidz.com',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY,
  );
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: note.title, body: note.body, url: note.url ?? '/parent', tag: note.tag }),
      );
      sent++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
    } catch (e: any) {
      // 404/410 = the browser dropped the subscription; clean it up.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      }
    }
  }
  return sent > 0 ? { ok: true, sent } : { ok: false, reason: 'all endpoints failed' };
}

// ── Channel 2: WhatsApp through the BSP ──
export async function sendWhatsApp(to: string, text: string, bspName?: string | null, vars?: Record<string, any>) {
  if (!waEnabled()) return { ok: false, reason: 'BSP not configured' };
  const url = process.env.WA_BSP_URL;
  if (!url) return { ok: false, reason: 'WA_BSP_URL missing' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_BSP_KEY}` },
      // Generic payload — BSPs differ slightly; adjust this one object at go-live.
      body: JSON.stringify({ to: normPhone(to), type: bspName ? 'template' : 'text', text, template: bspName, params: vars ?? {} }),
    });
    if (!res.ok) return { ok: false, reason: `BSP HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'BSP request failed' };
  }
}

// ── Channel 3: email ──
export async function sendEmail(to: string, subject: string, text: string) {
  if (!emailEnabled() || !to) return { ok: false, reason: 'SMTP not configured' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: process.env.SMTP_FROM ?? 'BumbleB Kidz <no-reply@bumblebkidz.com>', to, subject, text });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'SMTP failed' };
  }
}

// ── Queue a parent-facing message, and try app push right away ──
// Push is instant and free, so it runs at queue time; WhatsApp/email happen
// on dispatch (they cost money and may need approved templates).
export async function notifyParent(
  prisma: PrismaService,
  m: { type: string; studentId?: string | null; unitId?: string | null; recipient: string; payload?: any; email?: string | null },
) {
  if (!m.recipient) return null;
  const log = await prisma.messageLog.create({
    data: {
      type: m.type, recipient: m.recipient, studentId: m.studentId ?? null,
      unitId: m.unitId ?? null, payload: m.payload ?? {},
    },
  });
  const rendered = await renderMessage(prisma, m.type, m.payload);
  const push = await sendPush(prisma, m.recipient, { title: rendered.title, body: rendered.body, tag: m.type });
  if (push.ok) {
    await prisma.messageLog.update({
      where: { id: log.id },
      data: { channel: 'PUSH', status: 'SENT', sentAt: new Date(), payload: { ...(m.payload ?? {}), delivery: { push: 'SENT' } } },
    });
  }
  return log;
}

// ── Dispatch the outbox through the fallback chain ──
export async function dispatchQueued(prisma: PrismaService, where: any, limit = 500) {
  const pending = await prisma.messageLog.findMany({
    where: { status: 'QUEUED', ...where },
    include: { student: { select: { fatherName: true, motherName: true } } },
    take: limit,
  });
  const result = { total: pending.length, push: 0, whatsapp: 0, email: 0, sandbox: 0, failed: 0 };
  // "Sandbox" = no paid delivery channel is configured yet. Web push alone does
  // not count: a parent who has not installed the PWA has no device to reach,
  // and that must not be reported as a delivery failure before go-live.
  const sandbox = !waEnabled() && !emailEnabled();

  for (const m of pending) {
    // Internal staff tasks never leave the building.
    if (m.channel === 'INTERNAL') {
      await prisma.messageLog.update({ where: { id: m.id }, data: { status: 'SENT', sentAt: new Date() } });
      result.sandbox++;
      continue;
    }
    const payload: any = m.payload ?? {};
    const rendered = await renderMessage(prisma, m.type, { parent: m.student?.fatherName ?? m.student?.motherName ?? 'Parent', ...payload });
    const delivery: Record<string, string> = {};
    let channel: string | null = null;

    const push = await sendPush(prisma, m.recipient, { title: rendered.title, body: rendered.body, tag: m.type });
    delivery.push = push.ok ? 'SENT' : `SKIPPED (${push.reason})`;
    if (push.ok) { channel = 'PUSH'; result.push++; }

    if (!channel) {
      const wa = await sendWhatsApp(m.recipient, rendered.body, rendered.bspName, payload);
      delivery.whatsapp = wa.ok ? 'SENT' : `SKIPPED (${wa.reason})`;
      if (wa.ok) { channel = 'WHATSAPP'; result.whatsapp++; }
    }
    if (!channel && payload.email) {
      const em = await sendEmail(payload.email, rendered.title, rendered.body);
      delivery.email = em.ok ? 'SENT' : `SKIPPED (${em.reason})`;
      if (em.ok) { channel = 'EMAIL'; result.email++; }
    }

    if (!channel && sandbox) { channel = 'SANDBOX'; result.sandbox++; }      // nothing paid configured yet
    if (!channel) result.failed++;                                           // live channel exists but refused

    await prisma.messageLog.update({
      where: { id: m.id },
      data: {
        channel: channel === 'SANDBOX' ? m.channel : channel ?? m.channel,
        status: channel ? 'SENT' : 'FAILED',
        sentAt: channel ? new Date() : null,
        payload: { ...payload, delivery },
      },
    });
  }
  return { ...result, mode: sandbox ? 'SANDBOX' : 'LIVE' };
}

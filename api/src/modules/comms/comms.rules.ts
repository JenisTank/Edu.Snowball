/**
 * Communication rules — pure functions.
 *
 * The spec asks for one outbox with a defined fallback order and an escalation
 * to the Academic Director when a parent is left unanswered. Both decisions are
 * encoded here so they can be tested without a phone or a mail server.
 */

export const CHANNELS = ['PUSH', 'WHATSAPP', 'EMAIL'] as const;
export type Channel = (typeof CHANNELS)[number];

export const MESSAGE_STATUSES = ['QUEUED', 'SENT', 'FAILED', 'SUPPRESSED'] as const;

/** Channel preference per message type: push first (free), WhatsApp, then email. */
export const CHANNEL_POLICY: Record<string, Channel[]> = {
  ANNOUNCEMENT: ['PUSH', 'WHATSAPP', 'EMAIL'],
  ABSENCE_ALERT: ['PUSH', 'WHATSAPP', 'EMAIL'],
  ESCALATION_3DAY: ['WHATSAPP', 'EMAIL'],
  ADMIN_CALL: ['WHATSAPP'],
  FEE_REMINDER: ['PUSH', 'WHATSAPP', 'EMAIL'],
  RECEIPT: ['WHATSAPP', 'EMAIL'],
  ADMISSION_CONFIRMATION: ['WHATSAPP', 'EMAIL'],
  LEAVE_APPROVED: ['PUSH', 'WHATSAPP'],
  LEAVE_REJECTED: ['PUSH', 'WHATSAPP'],
  DEFAULT: ['PUSH', 'WHATSAPP', 'EMAIL'],
};

export interface RecipientCapabilities {
  hasPush: boolean;
  hasWhatsApp: boolean;
  hasEmail: boolean;
}

/**
 * The ordered list of channels to attempt for one message.
 *
 * A channel is only attempted when the recipient can actually receive it —
 * sending WhatsApp to a phone with no BSP session is how message queues rot.
 */
export function channelPlan(
  type: string,
  caps: RecipientCapabilities,
  available: { whatsapp: boolean; email: boolean } = { whatsapp: true, email: true },
): Channel[] {
  const policy = CHANNEL_POLICY[type] ?? CHANNEL_POLICY.DEFAULT;
  return policy.filter((c) => {
    if (c === 'PUSH') return caps.hasPush;
    if (c === 'WHATSAPP') return caps.hasWhatsApp && available.whatsapp;
    return caps.hasEmail && available.email;
  });
}

/** Back-off between delivery attempts: 1 min, 5 min, 30 min. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

export function retryDelay(attempt: number): number {
  if (attempt <= 0) return 0;
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
}

/** Give up after this many attempts and mark the message FAILED. */
export const MAX_ATTEMPTS = 4;

// ───────────────────────── parent-message SLA ─────────────────────────

/** A parent message unanswered for this long is escalated to the AD. */
export const PARENT_REPLY_SLA_HOURS = 4;
/** Escalations only fire inside working hours (IST). */
export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;

/**
 * Should this parent message be escalated now?
 *
 * The SLA clock only runs during business hours, so a message sent at 22:00 is
 * not "late" at 02:00 — it starts counting at 09:00 the next morning.
 */
export function shouldEscalate(opts: {
  createdAt: Date | string;
  now?: Date;
  alreadyEscalated?: boolean;
  replied?: boolean;
  slaHours?: number;
}): boolean {
  if (opts.alreadyEscalated || opts.replied) return false;
  const now = opts.now ?? new Date();
  if (!isBusinessHours(now)) return false;
  const created = new Date(opts.createdAt);
  const slaMs = (opts.slaHours ?? PARENT_REPLY_SLA_HOURS) * 3_600_000;
  // Count only working hours between creation and now.
  const elapsed = businessMsBetween(created, now);
  return elapsed > slaMs;
}

export function istParts(d: Date) {
  const shifted = new Date(d.getTime() + 5.5 * 3_600_000);
  return {
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
    dateISO: shifted.toISOString().slice(0, 10),
  };
}

export function isBusinessHours(d: Date): boolean {
  const { hour, weekday } = istParts(d);
  return weekday !== 0 && hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

/** Milliseconds of business time between two instants (IST, Mon–Sat, 9–18). */
export function businessMsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCMinutes(0, 0, 0);
  // Walk hour by hour: bounded by the SLA window, so this stays cheap.
  const limit = Math.min(
    Math.ceil((to.getTime() - from.getTime()) / 3_600_000) + 2,
    24 * 14, // never look further back than a fortnight
  );
  for (let i = 0; i < limit; i++) {
    const slotStart = new Date(cursor.getTime() + i * 3_600_000);
    const slotEnd = new Date(slotStart.getTime() + 3_600_000);
    if (slotEnd <= from || slotStart >= to) continue;
    if (!isBusinessHours(slotStart)) continue;
    const overlap =
      Math.min(slotEnd.getTime(), to.getTime()) - Math.max(slotStart.getTime(), from.getTime());
    if (overlap > 0) total += overlap;
  }
  return total;
}

// ───────────────────────── templates ─────────────────────────

export interface TemplateLike {
  code: string;
  body: string;
  channel?: string;
  language?: string;
}

/** Default HO-locked templates, seeded on first run. */
export const DEFAULT_TEMPLATES: {
  code: string;
  name: string;
  channel: Channel | 'INTERNAL';
  language: string;
  body: string;
  metaTemplate?: string;
}[] = [
  {
    code: 'absence_alert',
    name: 'Absence alert',
    channel: 'WHATSAPP',
    language: 'en',
    body: 'Dear parent, {{child}} was marked absent from {{batch}} today ({{date}}). If this is unexpected, please call the centre immediately.',
    metaTemplate: 'absence_alert_v1',
  },
  {
    code: 'fee_reminder',
    name: 'Fee reminder',
    channel: 'WHATSAPP',
    language: 'en',
    body: 'Dear parent, ₹{{amount}} for {{child}} is due on {{dueDate}}. Kindly pay at the centre or through the parent portal.',
    metaTemplate: 'fee_reminder_v1',
  },
  {
    code: 'receipt',
    name: 'Payment receipt',
    channel: 'WHATSAPP',
    language: 'en',
    body: 'Thank you! We have received ₹{{amount}} for {{child}} (receipt {{receiptNo}}). A PDF copy is in your parent portal.',
  },
  {
    code: 'admission_confirmation',
    name: 'Admission confirmation',
    channel: 'WHATSAPP',
    language: 'en',
    body: 'Welcome to BumbleB Kidz! {{child}} is confirmed in {{batch}} ({{admissionNo}}). Orientation: {{orientationDate}}.',
  },
  {
    code: 'leave_approved',
    name: 'Leave approved',
    channel: 'WHATSAPP',
    language: 'en',
    body: 'Your leave request for {{child}} ({{fromDate}} to {{toDate}}) is approved. Thank you for telling us.',
  },
  {
    code: 'weekly_digest',
    name: 'Weekly parent digest',
    channel: 'EMAIL',
    language: 'en',
    // The digest body is generated per child (digest.rules.ts); this row exists
    // so the template list is complete and HO can see the fallback wording.
    body: "Dear parent, here is {{child}}'s week at BumbleB Kidz: {{summary}}",
  },
  {
    code: 'escalation_3day',
    name: 'Three-day absence escalation',
    channel: 'INTERNAL',
    language: 'en',
    body: '{{child}} has been absent for 3 consecutive days. Please call the family today.',
  },
  {
    code: 'unmarked_register',
    name: 'Register not submitted',
    channel: 'INTERNAL',
    language: 'en',
    body: 'The attendance register for {{batch}} ({{date}}) was not submitted. Every child is still marked absent.',
  },
];

/**
 * Render a `{{var}}` template. Unknown variables are left visible on purpose:
 * a blank space hides a bug, `{{child}}` sends someone to the template editor.
 */
export function renderTemplate(body: string, vars: Record<string, unknown> = {}): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) =>
    vars[key] == null ? `{{${key}}}` : String(vars[key]),
  );
}

/** Variables a template still needs; used to validate before sending. */
export function missingVariables(body: string, vars: Record<string, unknown> = {}): string[] {
  const needed = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(needed)].filter((k) => vars[k] == null);
}

/** Normalise an Indian phone number to +91XXXXXXXXXX for the BSP. */
export function normalisePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

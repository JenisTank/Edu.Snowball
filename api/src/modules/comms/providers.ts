import { Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { normalisePhone } from './comms.rules';

/**
 * Delivery providers.
 *
 * Every provider returns the same shape, so the dispatcher can fall back from
 * push → WhatsApp → email without caring who is behind it. When credentials are
 * absent the provider reports `sandbox: true` instead of failing: the whole
 * pipeline (queue → attempt → delivery state) stays testable before go-live.
 */

const log = new Logger('Comms');

export interface SendResult {
  ok: boolean;
  via: string;
  providerId?: string;
  sandbox?: boolean;
  error?: string;
}

export interface OutgoingMessage {
  phone?: string | null;
  email?: string | null;
  text: string;
  template?: { name: string; language: string; variables: string[] };
  subject?: string;
}

export function whatsappConfigured(): boolean {
  return !!(env.waBspKey && env.waPhoneId);
}

export function emailConfigured(): boolean {
  return !!env.smtpUrl;
}

/**
 * WhatsApp Cloud API (or a BSP that speaks the same shape).
 *
 * Templates are mandatory for business-initiated messages, so the template name
 * and ordered variables are sent when known; otherwise this degrades to a text
 * message, which only works inside a 24-hour customer service window.
 */
export async function sendWhatsApp(msg: OutgoingMessage): Promise<SendResult> {
  const to = normalisePhone(msg.phone);
  if (!to) return { ok: false, via: 'WHATSAPP', error: 'No usable phone number' };

  if (!whatsappConfigured()) {
    log.debug(`sandbox WhatsApp → ${to}: ${msg.text.slice(0, 60)}`);
    return { ok: true, via: 'WHATSAPP_SANDBOX', sandbox: true };
  }

  const payload = msg.template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: msg.template.name,
          language: { code: msg.template.language },
          components: [
            {
              type: 'body',
              parameters: msg.template.variables.map((v) => ({ type: 'text', text: v })),
            },
          ],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.text } };

  try {
    const res = await fetch(`${env.waBspUrl.replace(/\/$/, '')}/${env.waPhoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.waBspKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        via: 'WHATSAPP',
        error: body?.error?.message ?? `BSP responded ${res.status}`,
      };
    }
    return { ok: true, via: 'WHATSAPP', providerId: body?.messages?.[0]?.id };
  } catch (e: any) {
    return { ok: false, via: 'WHATSAPP', error: e?.message ?? 'WhatsApp dispatch failed' };
  }
}

let transporter: any = null;

/** Lazily build the SMTP transport so a bad URL cannot crash boot. */
async function mailTransport() {
  if (transporter) return transporter;
  if (!emailConfigured()) return null;
  const nodemailer = await import('nodemailer');
  transporter = nodemailer.createTransport(env.smtpUrl);
  return transporter;
}

export async function sendEmail(msg: OutgoingMessage): Promise<SendResult> {
  if (!msg.email) return { ok: false, via: 'EMAIL', error: 'No email address on file' };
  if (!emailConfigured()) {
    log.debug(`email disabled → ${msg.email}: ${msg.text.slice(0, 60)}`);
    return { ok: false, via: 'EMAIL', error: 'SMTP not configured' };
  }
  try {
    const tx = await mailTransport();
    if (!tx) return { ok: false, via: 'EMAIL', error: 'SMTP not configured' };
    const info = await tx.sendMail({
      from: env.mailFrom,
      to: msg.email,
      subject: msg.subject ?? 'BumbleB Kidz',
      text: msg.text,
    });
    return { ok: true, via: 'EMAIL', providerId: info?.messageId };
  } catch (e: any) {
    return { ok: false, via: 'EMAIL', error: e?.message ?? 'Email dispatch failed' };
  }
}

/** Which channels this deployment can actually deliver on. */
export function providerStatus() {
  return {
    whatsapp: { configured: whatsappConfigured(), mode: whatsappConfigured() ? 'LIVE' : 'SANDBOX' },
    email: { configured: emailConfigured(), mode: emailConfigured() ? 'LIVE' : 'DISABLED' },
    push: { configured: !!(env.vapidPublicKey && env.vapidPrivateKey) },
  };
}

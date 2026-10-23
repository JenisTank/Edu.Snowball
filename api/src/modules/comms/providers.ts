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

/**
 * Which WhatsApp transport this deployment speaks.
 *
 * `EVOLUTION` is the self-hosted Evolution API (a Baileys bridge): one WhatsApp
 * number, scanned once as a QR, then plain HTTP sends. No BSP, no per-message
 * fee, no template pre-approval — which is exactly why it sends free-form text
 * and we do not pretend otherwise.
 *
 * `CLOUD` is Meta's own Cloud API, kept because a BSP may be signed later; it
 * needs approved templates for business-initiated messages.
 *
 * `NONE` logs the message and reports sandbox, so the pipeline still runs.
 */
export type WhatsappTransport = 'EVOLUTION' | 'CLOUD' | 'NONE';

export function whatsappTransport(): WhatsappTransport {
  if (env.evolutionApiUrl && env.evolutionApiKey && env.evolutionInstance) return 'EVOLUTION';
  if (env.waBspKey && env.waPhoneId) return 'CLOUD';
  return 'NONE';
}

export function whatsappConfigured(): boolean {
  return whatsappTransport() !== 'NONE';
}

export function emailConfigured(): boolean {
  return !!env.smtpUrl;
}

/**
 * WhatsApp, through whichever bridge is configured.
 *
 * Evolution API (v2) takes `{ number, text }` at
 * `POST {base}/message/sendText/{instance}` with the instance API key in an
 * `apikey` header. Cloud API takes a template when the template was approved,
 * and plain text otherwise.
 */
export async function sendWhatsApp(msg: OutgoingMessage): Promise<SendResult> {
  const to = normalisePhone(msg.phone);
  if (!to) return { ok: false, via: 'WHATSAPP', error: 'No usable phone number' };

  const transport = whatsappTransport();
  if (transport === 'NONE') {
    log.debug(`sandbox WhatsApp → ${to}: ${msg.text.slice(0, 60)}`);
    return { ok: true, via: 'WHATSAPP_SANDBOX', sandbox: true };
  }
  if (transport === 'EVOLUTION') return sendViaEvolution(to, msg);

  return sendViaCloudApi(to, msg);
}

/**
 * Evolution API.
 *
 * Templates are rendered to text before the call: Evolution has no template
 * registry, so the approved-template concept simply does not apply. The text
 * the dispatcher already built is the message that goes out.
 */
async function sendViaEvolution(to: string, msg: OutgoingMessage): Promise<SendResult> {
  const base = env.evolutionApiUrl.replace(/\/$/, '');
  const url = `${base}/message/sendText/${encodeURIComponent(env.evolutionInstance)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.evolutionApiKey },
      body: JSON.stringify({
        number: to,
        text: msg.text,
        // Keep the send synchronous-ish: the dispatcher wants a definite result.
        options: { delay: 0, presence: 'composing' },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        via: 'WHATSAPP_EVOLUTION',
        error:
          body?.message ??
          (Array.isArray(body) ? body[0]?.message : undefined) ??
          `Evolution API responded ${res.status}`,
      };
    }
    return {
      ok: true,
      via: 'WHATSAPP_EVOLUTION',
      providerId: body?.key?.id ?? body?.messageId ?? undefined,
    };
  } catch (e: any) {
    return {
      ok: false,
      via: 'WHATSAPP_EVOLUTION',
      error: e?.message ?? 'Evolution API dispatch failed',
    };
  }
}

/** Meta Cloud API — kept for the day a BSP is signed. */
async function sendViaCloudApi(to: string, msg: OutgoingMessage): Promise<SendResult> {
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
  const transport = whatsappTransport();
  return {
    whatsapp: {
      configured: transport !== 'NONE',
      mode: transport === 'NONE' ? 'SANDBOX' : 'LIVE',
      transport,
      instance: transport === 'EVOLUTION' ? env.evolutionInstance : undefined,
    },
    email: { configured: emailConfigured(), mode: emailConfigured() ? 'LIVE' : 'DISABLED' },
    push: { configured: !!(env.vapidPublicKey && env.vapidPrivateKey) },
  };
}

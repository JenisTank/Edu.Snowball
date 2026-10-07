import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as webpush from 'web-push';

export function configurePush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@bumblebkidz.com', pub, priv);
  return !!(pub && priv);
}

export async function sendWebPush(prisma: any, phone: string, notification: { title: string; body: string; url?: string; tag?: string }) {
  if (!configurePush()) return { sent: 0, disabled: true };
  const subscriptions = await prisma.pushSubscription.findMany({ where: { phone: phone.replace(/[\s-]/g, '') } });
  let sent = 0;
  await Promise.all(subscriptions.map(async (s: any) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notification)); sent++; }
    catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }); else console.error('Push delivery failed:', e.message); }
  }));
  return { sent, disabled: false };
}

@Injectable()
export class PushService {
  constructor(private prisma: PrismaService) {}
  enabled() { return configurePush(); }
  async send(phone: string, notification: { title: string; body: string; url?: string; tag?: string }) { return sendWebPush(this.prisma, phone, notification); }
}

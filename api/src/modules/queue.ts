// ─────────────────────────────────────────────────────────────
// BullMQ queue + worker — absence scans, escalations, reminders.
// Jobs write MessageLog rows (status QUEUED); the WhatsApp BSP
// worker flips them to SENT in Slice 7.
// ─────────────────────────────────────────────────────────────
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // Fail fast instead of retrying forever when Redis is not running: the ERP
  // stays fully usable without it, only the background jobs pause.
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 1000, 10_000)),
} as any;

// One warning instead of an endless ECONNREFUSED stack-trace loop.
let redisWarned = false;
function onRedisError(err: any) {
  if (redisWarned) return;
  redisWarned = true;
  console.warn(`⚠️ Redis unavailable (${err?.code ?? err?.message}) — background jobs are paused. The API works normally; start Redis to resume absence scans and reminders.`);
}

export const bbQueue = new Queue('bb-jobs', { connection });
bbQueue.on('error', onRedisError);

export function startWorker(prisma: PrismaClient) {
  const worker = new Worker('bb-jobs', async (job) => {
    // ── Absence scan: runs at attendance-lock + 30 min (spec Rule 5) ──
    if (job.name === 'absence-scan') {
      const { batchId, date } = job.data as { batchId: string; date: string };
      const records = await prisma.attendanceRecord.findMany({
        where: { batchId, date: new Date(date), status: 'ABSENT' },
        include: { student: true, batch: true },
      });
      for (const r of records) {
        const phone = r.student.fatherPhone || r.student.motherPhone;
        if (!phone) continue;
        // dedupe: one absence alert per student per day
        const dup = await prisma.messageLog.findFirst({
          where: { type: 'ABSENCE_ALERT', studentId: r.studentId, createdAt: { gte: new Date(date) } },
        });
        if (dup) continue;
        await prisma.messageLog.create({
          data: {
            type: 'ABSENCE_ALERT', recipient: phone, studentId: r.studentId, unitId: r.unitId,
            payload: {
              template: 'absence_alert',
              child: `${r.student.firstName} ${r.student.lastName}`,
              batch: r.batch.name, date,
            },
            scheduledFor: new Date(),
          },
        });
        // ── 3-day consecutive absence → escalation to Centre Head ──
        const d1 = new Date(date); d1.setDate(d1.getDate() - 1);
        const d2 = new Date(date); d2.setDate(d2.getDate() - 2);
        const prev = await prisma.attendanceRecord.count({
          where: { studentId: r.studentId, status: 'ABSENT', date: { in: [d1, d2] } },
        });
        if (prev >= 2) {
          await prisma.messageLog.create({
            data: {
              type: 'ESCALATION_3DAY', channel: 'INTERNAL', recipient: 'CENTRE_HEAD',
              studentId: r.studentId, unitId: r.unitId,
              payload: { child: `${r.student.firstName} ${r.student.lastName}`, days: 3, lastDate: date },
            },
          });
        }
      }
      // ── Admin-call list: lock + 2h (spec) — queue the task marker ──
      await bbQueue.add('admin-call-list', { batchId, date }, { delay: 90 * 60 * 1000 });
      return { absentAlerts: records.length };
    }

    if (job.name === 'admin-call-list') {
      const { batchId, date } = job.data as { batchId: string; date: string };
      const stillAbsent = await prisma.attendanceRecord.findMany({
        where: { batchId, date: new Date(date), status: 'ABSENT' },
        include: { student: true },
      });
      for (const r of stillAbsent) {
        const dup = await prisma.messageLog.findFirst({
          where: { type: 'ADMIN_CALL', studentId: r.studentId, createdAt: { gte: new Date(date) } },
        });
        if (dup) continue;
        await prisma.messageLog.create({
          data: {
            type: 'ADMIN_CALL', channel: 'INTERNAL', recipient: 'UNIT_ADMIN',
            studentId: r.studentId, unitId: r.unitId,
            payload: { child: `${r.student.firstName} ${r.student.lastName}`, phone: r.student.fatherPhone ?? r.student.motherPhone, date },
          },
        });
      }
      return { adminCalls: stillAbsent.length };
    }
  }, { connection });
  worker.on('failed', (job, err) => console.error(`⚠️ job ${job?.name} failed:`, err.message));
  worker.on('error', onRedisError);
  return worker;
}

import { sendWebPush } from '../modules/notifications/push.service';
import { approvedLeaveMap } from '../modules/leaves/leaves.query';
import { env } from '../config/env';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';

// ─────────────────────────────────────────────────────────────
// BullMQ queue + worker — absence scans, escalations, reminders.
// Jobs write MessageLog rows (status QUEUED); the WhatsApp BSP
// worker flips them to SENT in Slice 7.
// ─────────────────────────────────────────────────────────────

const connection = { url: env.redisUrl } as any;

export const bbQueue = new Queue('bb-jobs', { connection });

/**
 * Queue depth for the health probe. Returns null when Redis is unreachable so
 * `/api/health` reports "redis down" instead of hanging on a socket.
 */
export async function queueHealth() {
  try {
    const counts = await Promise.race([
      bbQueue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    return {
      waiting: Number((counts as any).waiting ?? 0),
      active: Number((counts as any).active ?? 0),
      failed: Number((counts as any).failed ?? 0),
      delayed: Number((counts as any).delayed ?? 0),
    };
  } catch {
    return null;
  }
}

export function startWorker(prisma: PrismaClient) {
  const worker = new Worker(
    'bb-jobs',
    async (job) => {
      // ── 05:00 IST: derive today's plan for every active batch ──
      if (job.name === 'daily-attendance-plan') {
        const { runDailyScan } = await import('./scheduler');
        const result = await runDailyScan(prisma, { force: true });
        return { planned: result.planned, enqueued: result.enqueued };
      }

      // ── Absence scan: runs at attendance-lock + 30 min (spec Rule 5) ──
      if (job.name === 'absence-scan') {
        const { batchId, date } = job.data as { batchId: string; date: string };
        const records = await prisma.attendanceRecord.findMany({
          where: { batchId, date: new Date(date), status: 'ABSENT' },
          include: { student: true, batch: true },
        });

        // An APPROVED leave is the only thing that silences the chain. Leave
        // days are written as LEAVE so the register tells the truth too.
        const onLeave = await approvedLeaveMap(prisma, date, records[0]?.unitId ?? null);
        let suppressed = 0;
        for (const r of records) {
          const leave = onLeave.get(r.studentId);
          if (leave) {
            await prisma.attendanceRecord
              .update({
                where: { id: r.id },
                data: { status: 'LEAVE', overrideReason: 'Approved leave' },
              })
              .catch(() => null);
            suppressed += 1;
            continue;
          }
          const phone = r.student.fatherPhone || r.student.motherPhone;
          if (!phone) continue;
          // dedupe: one absence alert per student per day
          const dup = await prisma.messageLog.findFirst({
            where: {
              type: 'ABSENCE_ALERT',
              studentId: r.studentId,
              createdAt: { gte: new Date(date) },
            },
          });
          if (dup) continue;
          await prisma.messageLog.create({
            data: {
              type: 'ABSENCE_ALERT',
              recipient: phone,
              studentId: r.studentId,
              unitId: r.unitId,
              payload: {
                template: 'absence_alert',
                child: `${r.student.firstName} ${r.student.lastName}`,
                batch: r.batch.name,
                date,
              },
              scheduledFor: new Date(),
            },
          });
          await sendWebPush(prisma, phone, {
            title: 'Attendance alert',
            body: `${r.student.firstName} was marked absent today. Tap to review.`,
            url: '/parent',
            tag: `absence-${r.studentId}-${date}`,
          });
          // ── 3-day consecutive absence → escalation to Centre Head ──
          const d1 = new Date(date);
          d1.setDate(d1.getDate() - 1);
          const d2 = new Date(date);
          d2.setDate(d2.getDate() - 2);
          const prev = await prisma.attendanceRecord.count({
            where: { studentId: r.studentId, status: 'ABSENT', date: { in: [d1, d2] } },
          });
          if (prev >= 2) {
            await prisma.messageLog.create({
              data: {
                type: 'ESCALATION_3DAY',
                channel: 'INTERNAL',
                recipient: 'CENTRE_HEAD',
                studentId: r.studentId,
                unitId: r.unitId,
                payload: {
                  child: `${r.student.firstName} ${r.student.lastName}`,
                  days: 3,
                  lastDate: date,
                },
              },
            });
          }
        }
        // ── Admin-call list: lock + 2h (spec) — queue the task marker ──
        await bbQueue.add(
          'admin-call-list',
          { batchId, date },
          { delay: 90 * 60 * 1000, jobId: `admin-call-${batchId}-${date}` },
        );
        return { absentAlerts: records.length - suppressed, onApprovedLeave: suppressed };
      }

      // ── The register was never submitted → Centre Head alert ──
      // This is the job that makes the safety net independent of a teacher
      // remembering to open the roster.
      if (job.name === 'teacher-not-marked') {
        const { batchId, date } = job.data as { batchId: string; date: string };
        const [batch, marked] = await Promise.all([
          prisma.batch.findUnique({
            where: { id: batchId },
            select: {
              id: true,
              name: true,
              unitId: true,
              startTime: true,
              _count: { select: { students: { where: { status: 'ACTIVE' } } } },
            },
          }),
          prisma.attendanceRecord.count({ where: { batchId, date: new Date(date) } }),
        ]);
        if (!batch || marked > 0) return { skipped: 'register submitted' };
        const dup = await prisma.messageLog.findFirst({
          where: {
            type: 'TEACHER_NOT_MARKED',
            unitId: batch.unitId,
            createdAt: { gte: new Date(date) },
            payload: { path: ['batchId'], equals: batchId },
          },
        });
        if (dup) return { skipped: 'already alerted' };
        await prisma.messageLog.create({
          data: {
            type: 'TEACHER_NOT_MARKED',
            channel: 'INTERNAL',
            recipient: 'CENTRE_HEAD',
            unitId: batch.unitId,
            payload: {
              batchId,
              batch: batch.name,
              date,
              activeStudents: batch._count.students,
              startTime: batch.startTime,
              message:
                'Attendance register was not submitted — every child in this batch is still marked absent.',
            },
          },
        });
        return { alerted: true };
      }

      if (job.name === 'admin-call-list') {
        const { batchId, date } = job.data as { batchId: string; date: string };
        const stillAbsent = await prisma.attendanceRecord.findMany({
          where: { batchId, date: new Date(date), status: 'ABSENT' },
          include: { student: true },
        });
        for (const r of stillAbsent) {
          const dup = await prisma.messageLog.findFirst({
            where: {
              type: 'ADMIN_CALL',
              studentId: r.studentId,
              createdAt: { gte: new Date(date) },
            },
          });
          if (dup) continue;
          await prisma.messageLog.create({
            data: {
              type: 'ADMIN_CALL',
              channel: 'INTERNAL',
              recipient: 'UNIT_ADMIN',
              studentId: r.studentId,
              unitId: r.unitId,
              payload: {
                child: `${r.student.firstName} ${r.student.lastName}`,
                phone: r.student.fatherPhone ?? r.student.motherPhone,
                date,
              },
            },
          });
        }
        return { adminCalls: stillAbsent.length };
      }
    },
    { connection },
  );
  worker.on('failed', (job, err) => console.error(`⚠️ job ${job?.name} failed:`, err.message));
  return worker;
}

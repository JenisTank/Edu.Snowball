import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { PdfService } from '../../common/pdf/pdf.service';
import { emailConfigured, sendEmail } from './providers';
import {
  DIGEST_TEMPLATE,
  DIGEST_TYPE,
  buildDigest,
  digestDue,
  digestRecipient,
  weekKey,
  weekRange,
} from './digest.rules';
import { ACADEMIC_YEAR, buildLedger, buildSchedule } from '../fees/fees.rules';

/**
 * Weekly parent digest.
 *
 * Writes one MessageLog row per child per week (type `WEEKLY_DIGEST`, channel
 * EMAIL) and hands it to the same dispatcher the rest of the app uses, so the
 * digest inherits retries, sandbox mode and the delivery audit trail for free.
 *
 * The unique guard is `(studentId, weekKey)`: the ISO week is stored in the
 * payload and checked before queuing, which makes the job safe to run twice,
 * to re-run after a crash, and to trigger by hand.
 */
@Injectable()
export class DigestService {
  private readonly log = new Logger('Digest');

  constructor(
    private prisma: PrismaService,
    private pdf: PdfService,
  ) {}

  /** Preview the digest for one child without writing anything. */
  async preview(studentId: string, now: Date = new Date()) {
    const data = await this.collect(studentId, now);
    if (!data) return null;
    return buildDigest(data);
  }

  /** Gather everything one child's digest needs. */
  private async collect(studentId: string, now: Date) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        unit: { select: { name: true } },
        programme: { select: { id: true, name: true } },
        batch: { select: { name: true } },
      },
    });
    if (!student || student.anonymisedAt) return null;

    const { from, to } = weekRange(now);
    const weekStart = new Date(`${from}T00:00:00+05:30`);
    const weekEnd = new Date(`${to}T23:59:59.999+05:30`);

    const [attendance, txns, structure, certificates, ptmSlot, academic] = await Promise.all([
      // Attendance rows only exist once a register is submitted, so counts here
      // are "marked days", not calendar days.
      (this.prisma as any).attendanceRecord.groupBy
        ? (this.prisma as any).attendanceRecord
            .groupBy({
              by: ['status'],
              where: { studentId, date: { gte: weekStart, lte: weekEnd } },
              _count: { _all: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      this.prisma.feeTransaction
        .findMany({
          where: { studentId, isCancelled: false },
          select: { amount: true, ledgerType: true, paymentDate: true },
          orderBy: { paymentDate: 'desc' },
        })
        .catch(() => []),
      (this.prisma as any).feeStructure
        .findFirst({
          where: {
            unitId: student.unitId,
            programmeId: student.programmeId ?? undefined,
            academicYear: ACADEMIC_YEAR,
          },
        })
        .catch(() => null),
      this.prisma.certificate
        .findMany({
          where: { studentId, issuedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
          select: { type: true, issuedAt: true },
          orderBy: { issuedAt: 'desc' },
        })
        .catch(() => []),
      (this.prisma as any).ptmSlot
        .findFirst({
          where: {
            studentId,
            startTime: { gte: now },
            session: { status: 'SCHEDULED' },
          },
          include: { session: { select: { title: true, scheduledAt: true } } },
          orderBy: { startTime: 'asc' },
        })
        .catch(() => null),
      (this.prisma as any).academicPlan
        ? (this.prisma as any).academicPlan
            .findMany({
              where: {
                unitId: student.unitId,
                status: { in: ['APPROVED', 'LOCKED'] },
                OR: [
                  { date: { gte: weekStart, lte: weekEnd } },
                  { month: { gte: from.slice(0, 7), lte: to.slice(0, 7) } },
                ],
                visibleToParents: true,
              },
              select: { title: true, date: true },
              take: 3,
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const counts = { present: 0, absent: 0, leave: 0, marked: 0 };
    for (const row of attendance as any[]) {
      const n = row?._count?._all ?? 0;
      counts.marked += n;
      if (row.status === 'PRESENT') counts.present += n;
      else if (row.status === 'LEAVE') counts.leave += n;
      else counts.absent += n;
    }

    let fees: any = null;
    if (structure) {
      const plan = (student as any).instalmentPlan ?? 'PLAN_C';
      const ledger = buildLedger(
        buildSchedule(structure, plan, !!(student as any).siblingGroup),
        plan,
        txns as any[],
        now.toISOString().slice(0, 10),
      );
      const next = ledger.instalments.find((i) => i.status !== 'PAID');
      const last = txns[0];
      fees = {
        dueAmount: next ? Math.max(0, next.amount - next.paid) : 0,
        dueDate: next?.dueDate ?? null,
        overdue: ledger.overdue > 0,
        lastPaymentAmount: last ? Number(last.amount) : null,
        lastPaymentDate: last?.paymentDate ?? null,
      };
    }

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNo: student.admissionNo,
        guardianEmail: student.guardianEmail,
      },
      unit: { name: student.unit?.name ?? null },
      attendance: counts,
      fees,
      upcomingPtm: ptmSlot
        ? {
            title: (ptmSlot as any).session?.title ?? 'Parent–teacher meeting',
            scheduledAt: (ptmSlot as any).session?.scheduledAt ?? (ptmSlot as any).startTime,
            slotAt: (ptmSlot as any).startTime,
          }
        : null,
      certificates: (certificates as any[]).map((c) => ({
        type: c.type,
        issuedAt: c.issuedAt,
      })),
      academic: (academic as any[]).map((a) => ({ title: a.title, date: a.date })),
      weekOf: from,
    };
  }

  /**
   * Queue this week's digests.
   *
   * `dryRun` reports what would be sent without touching the queue, which is
   * what the settings screen uses to show the count before the first real run.
   */
  async run(opts: { unitId?: string; dryRun?: boolean; now?: Date; limit?: number } = {}): Promise<{
    week: string;
    eligible: number;
    queued: number;
    skipped: number;
    empty: number;
    details: { studentId: string; action: string; reason?: string }[];
  }> {
    const now = opts.now ?? new Date();
    const week = weekKey(now);
    const students = await this.prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        anonymisedAt: null,
        ...(opts.unitId ? { unitId: opts.unitId } : {}),
      },
      select: { id: true, guardianEmail: true, firstName: true, lastName: true },
      take: opts.limit ?? 2000,
    });

    const already = await this.prisma.messageLog.findMany({
      where: {
        type: DIGEST_TYPE,
        studentId: { in: students.map((s: any) => s.id) },
      },
      select: { studentId: true, payload: true },
    });
    const sentThisWeek = new Set(
      already.filter((r: any) => (r.payload as any)?.week === week).map((r: any) => r.studentId),
    );

    const details: { studentId: string; action: string; reason?: string }[] = [];
    let queued = 0,
      skipped = 0,
      empty = 0;

    for (const s of students as any[]) {
      const due = digestDue({
        hasEmail: !!digestRecipient(s),
        alreadySentThisWeek: sentThisWeek.has(s.id),
      });
      if (!due.due) {
        skipped++;
        details.push({ studentId: s.id, action: 'SKIP', reason: due.reason });
        continue;
      }
      const data = await this.collect(s.id, now);
      if (!data) {
        skipped++;
        details.push({ studentId: s.id, action: 'SKIP', reason: 'No record' });
        continue;
      }
      const content = buildDigest(data);
      if (content.empty) {
        empty++;
        details.push({ studentId: s.id, action: 'SKIP', reason: 'Nothing to report' });
        continue;
      }
      if (!opts.dryRun) {
        await this.prisma.messageLog.create({
          data: {
            type: DIGEST_TYPE,
            channel: 'EMAIL',
            recipient: digestRecipient(s)!,
            studentId: s.id,
            unitId: (data as any).unitId ?? null,
            payload: { ...content.payload, week, subject: content.subject, body: content.text },
            status: 'QUEUED',
            templateCode: DIGEST_TEMPLATE,
          },
        });
      }
      queued++;
      details.push({ studentId: s.id, action: opts.dryRun ? 'WOULD_SEND' : 'QUEUED' });
    }

    this.log.log(
      `weekly digest ${week}: queued=${queued} skipped=${skipped} empty=${empty}${opts.dryRun ? ' (dry run)' : ''}`,
    );
    return { week, eligible: students.length, queued, skipped, empty, details };
  }

  /** One-page PDF version of the same digest, for the parent portal download. */
  async digestPdf(studentId: string, now: Date = new Date()): Promise<Buffer | null> {
    const data = await this.collect(studentId, now);
    if (!data) return null;
    const content = buildDigest(data);
    return this.pdf.textPdf({
      title: 'Weekly update',
      subtitle: `${data.student.firstName} ${data.student.lastName ?? ''}`.trim(),
      body: content.text,
    });
  }

  /** Send the queued digests immediately (the scheduler normally does this). */
  async flush(limit = 50): Promise<{ sent: number; failed: number; sandbox?: boolean }> {
    // No SMTP in this environment: leave the rows QUEUED rather than burning
    // the retry budget, and say so explicitly instead of reporting failure.
    if (!emailConfigured()) return { sent: 0, failed: 0, sandbox: true };
    const rows = await this.prisma.messageLog.findMany({
      where: { type: DIGEST_TYPE, status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let sent = 0,
      failed = 0;
    for (const row of rows as any[]) {
      const payload: any = row.payload ?? {};
      const result = await sendEmail({
        email: row.recipient,
        subject: payload.subject ?? 'Your weekly update',
        text: payload.body ?? '',
      });
      await this.prisma.messageLog
        .update({
          where: { id: row.id },
          data: result.ok
            ? {
                status: 'SENT',
                sentAt: new Date(),
                deliveredVia: result.via,
                attempts: { increment: 1 },
              }
            : {
                status: 'FAILED',
                lastError: result.error ?? 'Send failed',
                attempts: { increment: 1 },
              },
        })
        .catch(() => null);
      result.ok ? sent++ : failed++;
    }
    return { sent, failed };
  }
}

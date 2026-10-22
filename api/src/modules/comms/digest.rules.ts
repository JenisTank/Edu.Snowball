/**
 * Weekly parent digest — pure functions, no database access.
 *
 * The digest answers the three questions a parent actually asks: "was my child
 * in school", "what do I owe", and "is anything coming up". It is built from
 * data that already exists (attendance, fee ledger, PTM, certificates), so there
 * is no second source of truth and nothing to reconcile.
 *
 * Two constraints shape the design:
 *  - **No screening or safeguarding data.** Discovery Flight codes, medical
 *    notes and internal notes never enter a digest, even by accident.
 *  - **Send at most once per student per week.** The caller passes the ISO week
 *    key and the rules decide whether the digest is due, so a restart cannot
 *    mail a family twice.
 */

export const DIGEST_TYPE = 'WEEKLY_DIGEST';
export const DIGEST_TEMPLATE = 'weekly_digest';

/** Summarise one child's week. All values are already aggregated by SQL. */
export interface DigestInput {
  student: {
    id: string;
    firstName: string;
    lastName?: string | null;
    admissionNo?: string | null;
    guardianEmail?: string | null;
  };
  unit?: { name?: string | null } | null;
  attendance: { present: number; absent: number; leave: number; marked: number };
  fees?: {
    dueAmount?: number | string | null;
    dueDate?: string | Date | null;
    overdue?: boolean;
    lastPaymentAmount?: number | string | null;
    lastPaymentDate?: string | Date | null;
  } | null;
  upcomingPtm?: { title: string; scheduledAt: string | Date; slotAt?: string | Date | null } | null;
  certificates?: { type: string; issuedAt: string | Date }[];
  /** Published academic items for the week (already filtered to parent-visible). */
  academic?: { title: string; date?: string | null }[];
  weekOf: string;
}

export interface DigestContent {
  subject: string;
  text: string;
  html: string;
  /** Machine-readable payload stored on the message row for the audit trail. */
  payload: Record<string, unknown>;
  /** True when there is nothing worth sending. */
  empty: boolean;
}

const rupees = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const fmtDate = (d?: string | Date | null): string | null => {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Attendance rate over *marked* days, so holidays never read as absence. */
export function attendanceRate(a: { present: number; marked: number }): number {
  return a.marked > 0 ? Math.round((a.present / a.marked) * 100) : 0;
}

/**
 * Should a digest go out for this student this week?
 *
 *  - no guardian email → no digest (there is nowhere to send it),
 *  - already sent for this ISO week → no,
 *  - otherwise yes, even for a quiet week: silence is exactly what worries a
 *    parent, so the digest always carries the attendance line.
 */
export function digestDue(opts: { hasEmail: boolean; alreadySentThisWeek: boolean }): {
  due: boolean;
  reason?: string;
} {
  if (!opts.hasEmail) return { due: false, reason: 'No guardian email on file' };
  if (opts.alreadySentThisWeek) return { due: false, reason: 'Already sent this week' };
  return { due: true };
}

/** ISO-ish week key (YYYY-Www) in IST, used for the once-per-week guard. */
export function weekKey(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const day = d.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the ISO year
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The Monday–Sunday range a digest covers, as ISO dates. */
export function weekRange(now: Date = new Date()): { from: string; to: string } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const day = ist.getUTCDay() || 7;
  const monday = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - (day - 1)),
  );
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

/**
 * Build the digest content.
 *
 * Ordering is deliberate: attendance first (the safety question), then money,
 * then what is coming up, then milestones. A parent who reads only the first
 * line still learns the thing that matters most.
 */
export function buildDigest(input: DigestInput): DigestContent {
  const child = `${input.student.firstName} ${input.student.lastName ?? ''}`.trim();
  const rate = attendanceRate(input.attendance);
  const hasAttendance = input.attendance.marked > 0;

  const lines: string[] = [];
  const html: string[] = [];

  // ── Attendance ──
  const attendanceLine = hasAttendance
    ? `${child} was present ${input.attendance.present} of ${input.attendance.marked} marked days this week (${rate}%).`
    : `The register was not marked for ${child} this week — the centre will follow up.`;

  lines.push(attendanceLine);
  html.push(`<p>${escape(attendanceLine)}</p>`);

  if (input.attendance.leave > 0) {
    const leaveLine = `${input.attendance.leave} day(s) were recorded as approved leave.`;
    lines.push(leaveLine);
    html.push(`<p>${escape(leaveLine)}</p>`);
  }

  // ── Fees ──
  const due = num(input.fees?.dueAmount);
  if (due > 0) {
    const when = fmtDate(input.fees?.dueDate);
    const feeLine = input.fees?.overdue
      ? `An amount of ${rupees(due)} is overdue${when ? ` (was due ${when})` : ''}.`
      : `The next instalment of ${rupees(due)} is due${when ? ` on ${when}` : ''}.`;
    lines.push(feeLine);
    html.push(`<p>${escape(feeLine)}</p>`);
  } else if (input.fees?.lastPaymentAmount != null) {
    const paid = num(input.fees.lastPaymentAmount);
    const at = fmtDate(input.fees.lastPaymentDate);
    const receiptLine = `We received ${rupees(paid)}${at ? ` on ${at}` : ''}. Thank you.`;
    lines.push(receiptLine);
    html.push(`<p>${escape(receiptLine)}</p>`);
  }

  // ── Upcoming ──
  if (input.upcomingPtm) {
    const at = fmtDate(input.upcomingPtm.slotAt ?? input.upcomingPtm.scheduledAt);
    const slot = input.upcomingPtm.slotAt ? 'Your slot' : 'The meeting';
    const ptmLine = `${slot} for ${input.upcomingPtm.title} is on ${at}.`;
    lines.push(ptmLine);
    html.push(`<p>${escape(ptmLine)}</p>`);
  }

  for (const item of (input.academic ?? []).slice(0, 3)) {
    const when = item.date ? ` (${fmtDate(item.date)})` : '';
    lines.push(`Coming up: ${item.title}${when}.`);
    html.push(`<p>Coming up: ${escape(item.title)}${escape(when)}.</p>`);
  }

  // ── Milestones ──
  for (const cert of (input.certificates ?? []).slice(0, 3)) {
    const line = `${cert.type.replace(/_/g, ' ')} issued on ${fmtDate(cert.issuedAt)} — available in your parent portal.`;
    lines.push(line);
    html.push(`<p>${escape(line)}</p>`);
  }

  const signOff = '— BumbleB Kidz';
  lines.push(signOff);

  const subject = `${child}'s week at BumbleB Kidz (${fmtDate(input.weekOf) ?? input.weekOf})`;
  const text = lines.join('\n');

  const htmlDoc = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#2b2118;line-height:1.55">
  <h2 style="margin:0 0 4px;color:#8a5a12">BumbleB Kidz</h2>
  <p style="margin:0 0 16px;color:#7a6a58;font-size:13px">${escape(input.unit?.name ?? '')}${
    input.unit?.name ? ' · ' : ''
  }week of ${escape(fmtDate(input.weekOf) ?? input.weekOf)}</p>
  ${html.join('\n  ')}
  <p style="margin-top:20px;color:#7a6a58;font-size:12px">${escape(signOff)} · This is an automated weekly update. Reply through the parent portal.</p>
</body></html>`;

  // A week with no attendance, no money, no events and no milestones is not
  // worth an email — the caller can still preview it, but it is not sent.
  const empty =
    !hasAttendance &&
    due <= 0 &&
    input.fees?.lastPaymentAmount == null &&
    !input.upcomingPtm &&
    (input.academic ?? []).length === 0 &&
    (input.certificates ?? []).length === 0;

  return {
    subject,
    text,
    html: htmlDoc,
    empty,
    payload: {
      weekOf: input.weekOf,
      studentId: input.student.id,
      admissionNo: input.student.admissionNo ?? null,
      attendance: input.attendance,
      attendanceRate: rate,
      dueAmount: due || null,
      ptm: input.upcomingPtm?.title ?? null,
      certificates: (input.certificates ?? []).map((c) => c.type),
      academic: (input.academic ?? []).map((a) => a.title),
    },
  };
}

/** Recipients for a digest: the guardian email, else nothing. */
export function digestRecipient(student: { guardianEmail?: string | null }): string | null {
  const email = student.guardianEmail?.trim();
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/**
 * Cadence. One digest per family per week, sent Monday morning IST so it lands
 * before the school run. The scheduler compares the stored week key, not a
 * timestamp, so clock drift or a late restart cannot double-send.
 */
export const DIGEST_CADENCE = {
  weekday: 1, // Monday (1 = Monday … 7 = Sunday)
  hourIST: 8,
  minuteIST: 0,
} as const;

/** IST parts of an instant, without pulling in a date library. */
export function istWeekdayHour(now: Date): { weekday: number; hour: number; minute: number } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return {
    weekday: ist.getUTCDay() || 7,
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}

/**
 * Should the weekly run start now?
 *
 *  - only on the cadence weekday,
 *  - only after the cadence hour,
 *  - and never twice for the same week key.
 * Running late is fine (catch-up); running early is not.
 */
export function digestWindowOpen(
  now: Date,
  lastRunWeek: string | null,
  cadence = DIGEST_CADENCE,
): { open: boolean; reason: string; week: string } {
  const week = weekKey(now);
  const { weekday, hour } = istWeekdayHour(now);
  if (lastRunWeek === week) return { open: false, reason: 'Already ran this week', week };
  if (weekday !== cadence.weekday) return { open: false, reason: 'Not the cadence day', week };
  if (hour < cadence.hourIST) return { open: false, reason: 'Before send time', week };
  return { open: true, reason: 'Due', week };
}

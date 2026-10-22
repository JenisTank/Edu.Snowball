/**
 * Fee report aggregations — pure functions, no database access.
 *
 * The spec asks for 14 reports. Keeping the maths here means every report is
 * unit-testable and the controller stays a thin query layer. Money is always
 * handled as whole rupees (the business rounds at collection).
 */

export const REPORT_CATALOGUE = [
  { key: 'daily-collection', name: 'Daily Collection', group: 'COLLECTIONS' },
  { key: 'day-book', name: 'Day Book', group: 'COLLECTIONS' },
  { key: 'monthly-collection', name: 'Monthly Collection', group: 'COLLECTIONS' },
  { key: 'payment-mode', name: 'Payment Mode Analysis', group: 'COLLECTIONS' },
  { key: 'outstanding', name: 'Outstanding Fees', group: 'RECEIVABLES' },
  { key: 'fee-status', name: 'Fee Status per Student', group: 'RECEIVABLES' },
  { key: 'discounts', name: 'Discount & Concession', group: 'RECEIVABLES' },
  { key: 'cancellations', name: 'Cancellation & Refund Log', group: 'RECEIVABLES' },
  { key: 'structure-master', name: 'Fee Structure Master', group: 'MASTERS' },
  { key: 'programme-revenue', name: 'Programme-wise Revenue', group: 'ANALYSIS' },
  { key: 'unit-wise', name: 'Unit-wise Collection (HO)', group: 'ANALYSIS' },
  { key: 'head-wise', name: 'Head-wise Summary', group: 'ANALYSIS' },
  { key: 'addons', name: 'Add-on Fees', group: 'ANALYSIS' },
  { key: 'tally-export', name: 'Accounting Export (Tally)', group: 'EXPORT' },
] as const;

export type ReportKey = (typeof REPORT_CATALOGUE)[number]['key'];

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const iso = (d: Date | string) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
export const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

// ───────────────────────────── receipts ─────────────────────────────

export interface ReceiptLike {
  id?: string;
  receiptNo: string;
  amount: number | string;
  paymentMode: string;
  paymentDate: Date | string;
  isCancelled?: boolean;
  ledgerType?: string | null;
  instalmentNo?: number | null;
  discount?: number | string | null;
  fine?: number | string | null;
  reference?: string | null;
  remarks?: string | null;
  student?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    admissionNo?: string;
    programme?: { name?: string | null } | null;
    unit?: { code?: string; name?: string } | null;
  } | null;
  unit?: { code?: string; name?: string } | null;
}

/** Receipts that actually moved money: not cancelled, inside the window. */
export function liveReceipts(
  receipts: ReceiptLike[],
  range: { from?: string; to?: string } = {},
): ReceiptLike[] {
  return receipts.filter((r) => {
    if (r.isCancelled) return false;
    const d = iso(r.paymentDate);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}

/** Total collected, with a per-mode split. */
export function collectionTotals(receipts: ReceiptLike[]) {
  const byMode: Record<string, { amount: number; count: number }> = {};
  let total = 0;
  let count = 0;
  for (const r of receipts) {
    const a = num(r.amount);
    total += a;
    count += 1;
    const mode = r.paymentMode || 'UNKNOWN';
    byMode[mode] = byMode[mode] ?? { amount: 0, count: 0 };
    byMode[mode].amount += a;
    byMode[mode].count += 1;
  }
  return { total, count, byMode };
}

/** Daily collection: one row per day, split by mode. */
export function dailyCollection(receipts: ReceiptLike[]) {
  const days = new Map<
    string,
    { date: string; total: number; count: number; byMode: Record<string, number> }
  >();
  for (const r of liveReceipts(receipts)) {
    const date = iso(r.paymentDate);
    const row = days.get(date) ?? { date, total: 0, count: 0, byMode: {} };
    const a = num(r.amount);
    row.total += a;
    row.count += 1;
    row.byMode[r.paymentMode] = (row.byMode[r.paymentMode] ?? 0) + a;
    days.set(date, row);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Day book: chronological receipts for one day plus the cancellations made that
 * day, so the cash box reconciles (a cancellation is a negative line).
 */
export function dayBook(receipts: ReceiptLike[], dateISO: string) {
  const received = receipts
    .filter((r) => !r.isCancelled && iso(r.paymentDate) === dateISO)
    .sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));
  const cancelled = receipts
    .filter((r) => r.isCancelled && iso(r.paymentDate) === dateISO)
    .sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));
  const receivedTotal = received.reduce((s, r) => s + num(r.amount), 0);
  const cancelledTotal = cancelled.reduce((s, r) => s + num(r.amount), 0);
  return {
    date: dateISO,
    openingBalance: 0, // single cash box: the day opens at zero and closes on the net
    received,
    cancelled,
    receivedTotal,
    cancelledTotal,
    netCollection: receivedTotal - cancelledTotal,
    closingBalance: receivedTotal - cancelledTotal,
    byMode: collectionTotals(received).byMode,
  };
}

/** Monthly collection matrix for a calendar year (Jan…Dec). */
export function monthlyCollection(receipts: ReceiptLike[], year: number) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(Date.UTC(year, i, 1)).toLocaleString('en-IN', { month: 'short' }),
    total: 0,
    count: 0,
  }));
  for (const r of liveReceipts(receipts)) {
    const d = new Date(`${iso(r.paymentDate)}T00:00:00Z`);
    if (d.getUTCFullYear() !== year) continue;
    months[d.getUTCMonth()].total += num(r.amount);
    months[d.getUTCMonth()].count += 1;
  }
  return months;
}

/** Payment-mode analysis, including the share of each mode. */
export function paymentModeAnalysis(
  receipts: ReceiptLike[],
  range: { from?: string; to?: string } = {},
) {
  const { total, byMode } = collectionTotals(liveReceipts(receipts, range));
  return Object.entries(byMode)
    .map(([mode, v]) => ({
      mode,
      amount: v.amount,
      count: v.count,
      sharePct: total ? Math.round((v.amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// ───────────────────────────── receivable rows ─────────────────────────────

export interface LedgerRowLike {
  id: string;
  admissionNo: string;
  name: string;
  unit?: string;
  programme?: { name?: string | null } | null;
  plan?: string;
  gross?: number;
  discount?: number;
  net: number;
  paid: number;
  balance: number;
  overdue: number;
  sibling?: boolean;
  status?: string;
  instalments?: { no: number; amount: number; dueDate: string; paid: number; status: string }[];
}

export type AgeingBucket = 'CURRENT' | '1-30' | '31-60' | '61-90' | '90+';

/**
 * Age an outstanding balance by its oldest unpaid instalment.
 * This is what the founder actually chases, so the bucket follows the money
 * rather than the first due date of the year.
 */
export function ageingBucket(row: LedgerRowLike, todayISO: string): AgeingBucket {
  if (row.balance <= 0) return 'CURRENT';
  const overdueInstalments = (row.instalments ?? []).filter(
    (i) => i.paid < i.amount && i.dueDate < todayISO,
  );
  if (!overdueInstalments.length) return 'CURRENT';
  const oldest = overdueInstalments.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
  const days = Math.floor(
    (new Date(`${todayISO}T00:00:00Z`).getTime() -
      new Date(`${oldest.dueDate}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/** Outstanding register (only students who still owe money). */
export function outstandingRows(rows: LedgerRowLike[], todayISO: string) {
  const withBucket = rows
    .filter((r) => r.balance > 0)
    .map((r) => ({
      ...r,
      bucket: ageingBucket(r, todayISO),
      daysOverdue: overdueDays(r, todayISO),
    }))
    .sort((a, b) => b.balance - a.balance);
  const buckets: Record<AgeingBucket, number> = {
    CURRENT: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };
  for (const r of withBucket) buckets[r.bucket] += r.balance;
  return {
    rows: withBucket,
    totals: {
      students: withBucket.length,
      outstanding: withBucket.reduce((s, r) => s + r.balance, 0),
      overdue: withBucket.reduce((s, r) => s + r.overdue, 0),
      buckets,
    },
  };
}

function overdueDays(row: LedgerRowLike, todayISO: string): number {
  const overdue = (row.instalments ?? []).filter((i) => i.paid < i.amount && i.dueDate < todayISO);
  if (!overdue.length) return 0;
  const oldest = overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
  return Math.floor(
    (new Date(`${todayISO}T00:00:00Z`).getTime() -
      new Date(`${oldest.dueDate}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

/** Fee status per student, with the counts a centre head scans first. */
export function feeStatusRows(rows: LedgerRowLike[]) {
  const status = (r: LedgerRowLike) =>
    r.balance <= 0 ? 'PAID' : r.overdue > 0 ? 'OVERDUE' : r.paid > 0 ? 'PARTIAL' : 'DUE';
  const out = rows.map((r) => ({
    id: r.id,
    admissionNo: r.admissionNo,
    name: r.name,
    unit: r.unit,
    programme: r.programme?.name ?? null,
    plan: r.plan ?? null,
    net: r.net,
    paid: r.paid,
    balance: r.balance,
    status: status(r),
  }));
  const counts = { PAID: 0, PARTIAL: 0, DUE: 0, OVERDUE: 0 } as Record<string, number>;
  for (const r of out) counts[r.status] += 1;
  return { rows: out, counts, totalStudents: out.length };
}

/** Discount and concession register: sibling concession + per-receipt discounts. */
export function discountRows(rows: LedgerRowLike[], receipts: ReceiptLike[]) {
  const concessions = rows
    .filter((r) => num(r.discount) > 0)
    .map((r) => ({
      kind: 'SIBLING_CONCESSION',
      studentId: r.id,
      admissionNo: r.admissionNo,
      name: r.name,
      gross: num(r.gross),
      amount: num(r.discount),
      note: 'Sibling concession on the HO-locked fee structure',
    }));
  const manual = receipts
    .filter((r) => !r.isCancelled && num(r.discount) > 0)
    .map((r) => ({
      kind: 'RECEIPT_DISCOUNT',
      receiptNo: r.receiptNo,
      admissionNo: r.student?.admissionNo ?? '',
      name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
      amount: num(r.discount),
      date: iso(r.paymentDate),
      note: r.remarks ?? null,
    }));
  const fines = receipts
    .filter((r) => !r.isCancelled && num(r.fine) > 0)
    .map((r) => ({
      kind: 'LATE_FINE',
      receiptNo: r.receiptNo,
      admissionNo: r.student?.admissionNo ?? '',
      name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
      amount: num(r.fine),
      date: iso(r.paymentDate),
      note: 'Late payment fine',
    }));
  return {
    concessions,
    manual,
    fines,
    totals: {
      concession: concessions.reduce((s, r) => s + r.amount, 0),
      manualDiscount: manual.reduce((s, r) => s + r.amount, 0),
      fines: fines.reduce((s, r) => s + r.amount, 0),
    },
  };
}

/** Cancellation log — every cancelled receipt keeps its number and its reason. */
export function cancellationRows(
  receipts: ReceiptLike[],
  range: { from?: string; to?: string } = {},
) {
  const rows = receipts
    .filter((r) => r.isCancelled)
    .filter((r) => {
      const d = iso(r.paymentDate);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    })
    .map((r) => ({
      receiptNo: r.receiptNo,
      admissionNo: r.student?.admissionNo ?? '',
      name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
      amount: num(r.amount),
      mode: r.paymentMode,
      date: iso(r.paymentDate),
      remarks: r.remarks ?? null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length };
}

/** Revenue grouped by programme, with the share of the book. */
export function programmeRevenue(rows: LedgerRowLike[]) {
  const groups = new Map<
    string,
    { programme: string; students: number; billed: number; collected: number; balance: number }
  >();
  for (const r of rows) {
    const key = r.programme?.name ?? 'Unassigned';
    const g = groups.get(key) ?? {
      programme: key,
      students: 0,
      billed: 0,
      collected: 0,
      balance: 0,
    };
    g.students += 1;
    g.billed += num(r.net);
    g.collected += num(r.paid);
    g.balance += Math.max(0, num(r.balance));
    groups.set(key, g);
  }
  const rowsOut = [...groups.values()].sort((a, b) => b.collected - a.collected);
  const total = rowsOut.reduce((s, r) => s + r.collected, 0);
  return rowsOut.map((r) => ({
    ...r,
    sharePct: total ? Math.round((r.collected / total) * 1000) / 10 : 0,
  }));
}

/** Consolidated unit-wise view for Head Office. */
export function unitWiseRows(
  rows: LedgerRowLike[],
  receipts: ReceiptLike[],
  range: { from?: string; to?: string } = {},
) {
  const units = new Map<
    string,
    { unit: string; students: number; billed: number; collected: number; outstanding: number }
  >();
  for (const r of rows) {
    const key = r.unit ?? '—';
    const u = units.get(key) ?? { unit: key, students: 0, billed: 0, collected: 0, outstanding: 0 };
    u.students += 1;
    u.billed += num(r.net);
    u.collected += num(r.paid);
    u.outstanding += Math.max(0, num(r.balance));
    units.set(key, u);
  }
  const period = collectionTotals(liveReceipts(receipts, range));
  return {
    units: [...units.values()].sort((a, b) => b.collected - a.collected),
    periodCollection: period.total,
    totals: {
      students: rows.length,
      billed: rows.reduce((s, r) => s + num(r.net), 0),
      collected: rows.reduce((s, r) => s + num(r.paid), 0),
      outstanding: rows.reduce((s, r) => s + Math.max(0, num(r.balance)), 0),
    },
  };
}

/**
 * Head-wise summary. The fee structure is a single all-inclusive head, so the
 * breakdown reports the money that actually moved: tuition, fines, discounts
 * and add-ons.
 */
export function headWiseRows(
  rows: LedgerRowLike[],
  receipts: ReceiptLike[],
  addons: AddonLike[] = [],
) {
  const tuition = receipts.filter(
    (r) => !r.isCancelled && (r.ledgerType ?? 'PRESCHOOL') === 'PRESCHOOL',
  );
  const evening = receipts.filter((r) => !r.isCancelled && r.ledgerType === 'EVENING');
  const fines = receipts.reduce((s, r) => s + num(r.fine), 0);
  const discounts = receipts.reduce((s, r) => s + num(r.discount), 0);
  return [
    { head: 'Tuition (preschool)', amount: tuition.reduce((s, r) => s + num(r.amount), 0) },
    { head: 'Evening activity', amount: evening.reduce((s, r) => s + num(r.amount), 0) },
    {
      head: 'Add-on fees',
      amount: addons.filter((a) => a.status === 'PAID').reduce((s, a) => s + num(a.amount), 0),
    },
    { head: 'Late fines', amount: fines },
    { head: 'Discounts given', amount: -discounts },
    { head: 'Billed for the year', amount: rows.reduce((s, r) => s + num(r.net), 0) },
    { head: 'Outstanding', amount: rows.reduce((s, r) => s + Math.max(0, num(r.balance)), 0) },
  ];
}

export interface AddonLike {
  id: string;
  label: string;
  amount: number | string;
  status: string;
  ledgerType?: string | null;
  billedAt: Date | string;
  reference?: string | null;
  student?: { admissionNo?: string; firstName?: string; lastName?: string } | null;
}

export function addonRegister(addons: AddonLike[]) {
  const rows = addons.map((a) => ({
    id: a.id,
    label: a.label,
    admissionNo: a.student?.admissionNo ?? '',
    name: `${a.student?.firstName ?? ''} ${a.student?.lastName ?? ''}`.trim(),
    ledgerType: a.ledgerType ?? 'PRESCHOOL',
    amount: num(a.amount),
    status: a.status,
    billedAt: iso(a.billedAt),
    reference: a.reference ?? null,
  }));
  return {
    rows,
    totals: {
      billed: rows.reduce((s, r) => s + r.amount, 0),
      pending: rows.filter((r) => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0),
      paid: rows.filter((r) => r.status === 'PAID').reduce((s, r) => s + r.amount, 0),
      waived: rows.filter((r) => r.status === 'WAIVED').reduce((s, r) => s + r.amount, 0),
    },
  };
}

// ───────────────────────────── export ─────────────────────────────

/** RFC-4180 CSV cell: quote everything that could confuse a spreadsheet. */
export function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text. Accepts arrays of flat objects. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n');
}

/**
 * Tally-friendly export: one line per receipt with a signed amount, debit and
 * credit ledgers and a narration. Tally imports vouchers, not reports, so the
 * shape matters more than the totals.
 */
export function tallyExport(receipts: ReceiptLike[], range: { from?: string; to?: string } = {}) {
  const rows = liveReceipts(receipts, range).map((r) => {
    const name = `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim();
    return {
      voucherDate: iso(r.paymentDate),
      voucherType: 'Receipt',
      voucherNo: r.receiptNo,
      debitLedger: r.paymentMode === 'CASH' ? 'Cash' : 'Bank',
      creditLedger: 'School Fees',
      student: name,
      admissionNo: r.student?.admissionNo ?? '',
      amount: num(r.amount),
      narration:
        `${name} (${r.student?.admissionNo ?? ''}) ${r.ledgerType === 'EVENING' ? 'evening' : 'preschool'}` +
        (r.reference ? ` · ${r.reference}` : ''),
    };
  });
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

/** A stable filename for downloads. */
export function reportFilename(key: string, scope: string, dateISO: string): string {
  return `${key}-${scope}-${dateISO}.csv`.replace(/[^a-z0-9\-.]/gi, '-').toLowerCase();
}

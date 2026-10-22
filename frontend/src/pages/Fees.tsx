import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  BellRing,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Landmark,
  Printer,
  ReceiptText,
  Send,
  XCircle,
} from 'lucide-react';
import { api, fmtDate, downloadFile } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';
import { cn } from '../lib/utils';
import { useI18n, useLabels } from '../lib/i18n';

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const todayISO = () => new Date().toISOString().slice(0, 10);
const PLAN_LABEL: Record<string, string> = {
  PLAN_A: 'Plan A · 3 inst.',
  PLAN_B: 'Plan B · 2 inst.',
  PLAN_C: 'Plan C · Full',
};
const MODES = ['CASH', 'UPI', 'CHEQUE', 'POS', 'NEFT', 'RAZORPAY'];
const STATUS_TONE: Record<string, any> = {
  PAID: 'green',
  PARTIAL: 'sky',
  DUE: 'honey',
  OVERDUE: 'red',
};

// Receipt opens in a new tab; the bb_token cookie authenticates it.
function openReceipt(id: string) {
  window.open(`/api/fees/receipt/${id}/print`, '_blank');
}

// ───────────────────────── Reports (the 14 statutory reports) ─────────────────────────
const REPORT_GROUPS: Record<string, string> = {
  COLLECTIONS: 'Collections',
  RECEIVABLES: 'Receivables',
  MASTERS: 'Masters',
  ANALYSIS: 'Analysis',
  EXPORT: 'Export',
};

function ReportsTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [active, setActive] = useState('outstanding');
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/fees/reports')
      .then(setKeys)
      .catch(() => setErr('Could not load the report catalogue'));
  }, []);

  const buildUrl = (format?: string) => {
    const q = new URLSearchParams();
    if (active === 'daily-collection' || active === 'day-book') q.set('date', date);
    if (active === 'monthly-collection') q.set('year', month.slice(0, 4));
    if (active === 'payment-mode' || active === 'cancellations' || active === 'tally-export') {
      q.set('from', `${month}-01`);
      q.set('to', `${month}-31`);
    }
    if (format) q.set('format', format);
    return `/fees/reports/${active}?${q.toString()}`;
  };

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setResult(await api(buildUrl()));
    } catch (e: any) {
      setErr(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const rows: any[] =
    result?.rows ??
    result?.days?.map((d: any) => ({ date: d.date, receipts: d.count, amount: d.total })) ??
    result?.months ??
    result?.modes ??
    result?.units ??
    result?.programmes ??
    result?.heads ??
    result?.batches ??
    result?.vendors ??
    result?.items ??
    result?.concessions ??
    result?.categories ??
    result?.preview ??
    [];
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const money = (k: string) =>
    /amount|total|value|balance|paid|net|outstanding|billed|collected|due|discount/i.test(k);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="card p-3">
        <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wide text-[color:var(--txt3)]">
          {keys.length || 14} reports
        </div>
        <div className="space-y-3">
          {Object.entries(REPORT_GROUPS).map(([group, label]) => {
            const list = keys.filter((k: any) => k.group === group);
            if (!list.length) return null;
            return (
              <div key={group}>
                <div className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[color:var(--txt3)]">
                  {label}
                </div>
                {list.map((k: any) => (
                  <button
                    key={k.key}
                    onClick={() => {
                      setActive(k.key);
                      setResult(null);
                    }}
                    className={cn(
                      'mb-0.5 block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold transition',
                      active === k.key
                        ? 'bg-[color:var(--accent)] text-white'
                        : 'hover:bg-[color:var(--surface2)]',
                    )}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          {['daily-collection', 'day-book'].includes(active) && (
            <Field label="Date">
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          )}
          {['monthly-collection', 'payment-mode', 'cancellations', 'tally-export'].includes(
            active,
          ) && (
            <Field label="Month">
              <input
                type="month"
                className="input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </Field>
          )}
          <button className="btn-primary" onClick={run} disabled={busy}>
            <FileSpreadsheet className="mr-1 inline h-4 w-4" />
            {busy ? 'Running…' : 'Run report'}
          </button>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadFile(buildUrl('csv'), `${active}.csv`).catch((e) => setErr(e.message))
            }
          >
            <Download className="mr-1 inline h-4 w-4" />
            Download CSV
          </button>
        </div>
        <ErrorNote msg={err} />
        {result && (
          <div className="mb-2 flex flex-wrap gap-2 text-[11.5px] font-semibold text-[color:var(--txt3)]">
            <span className="chip">{rows.length} rows</span>
            {result.totals?.outstanding != null && (
              <span className="chip">Outstanding {inr(result.totals.outstanding)}</span>
            )}
            {result.total != null && typeof result.total === 'number' && (
              <span className="chip">{inr(result.total)}</span>
            )}
            {result.value != null && <span className="chip">Value {inr(result.value)}</span>}
            {result.counts && <span className="chip">{JSON.stringify(result.counts)}</span>}
          </div>
        )}
        <div className="max-h-[62vh] overflow-auto rounded-xl border border-[color:var(--line)]">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 bg-[color:var(--surface2)]">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--txt3)]"
                  >
                    {c.replace(/([A-Z])/g, ' $1')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r: any, i: number) => (
                <tr key={i} className="border-t border-[color:var(--line)]">
                  {columns.map((c) => (
                    <td key={c} className="px-2.5 py-1.5">
                      {r[c] && typeof r[c] === 'object'
                        ? JSON.stringify(r[c])
                        : money(c) && r[c] !== '' && r[c] != null
                          ? inr(r[c])
                          : String(r[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-[color:var(--txt3)]"
                    colSpan={Math.max(1, columns.length)}
                  >
                    {result ? 'No rows for this period.' : 'Run a report to see it here.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 500 && (
          <p className="mt-2 text-[11px] text-[color:var(--txt3)]">
            Showing the first 500 rows — download the CSV for the full report.
          </p>
        )}
      </section>
    </div>
  );
}

// ───────────────────────── Student fee drawer ─────────────────────────
function LedgerModal({ row, onClose }: { row: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canCollect = [...HO_ROLES, 'CENTRE_HEAD', 'COORDINATOR'].includes(user!.role);
  const canCancel = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const [err, setErr] = useState('');
  const [paid, setPaid] = useState<any>(null);
  const [form, setForm] = useState<any>({
    amount: '',
    paymentMode: 'UPI',
    reference: '',
    instalmentNo: '',
    remarks: '',
    ledgerType: 'PRESCHOOL',
  });

  const { data, refetch } = useQuery({
    queryKey: ['fee-student', row.id],
    queryFn: () => api(`/fees/ledger/${row.id}`),
  });

  const pay = useMutation({
    mutationFn: () =>
      api('/fees/pay', {
        method: 'POST',
        body: JSON.stringify({
          studentId: row.id,
          amount: Number(form.amount),
          paymentMode: form.paymentMode,
          reference: form.reference || undefined,
          remarks: form.remarks || undefined,
          instalmentNo: form.instalmentNo ? Number(form.instalmentNo) : undefined,
          ledgerType: form.ledgerType,
        }),
      }),
    onSuccess: (r) => {
      setPaid(r);
      setErr('');
      refetch();
      qc.invalidateQueries({ queryKey: ['fee-ledger'] });
      qc.invalidateQueries({ queryKey: ['fee-summary'] });
    },
    onError: (e: any) => setErr(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/fees/receipt/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: prompt('Cancellation reason (audited):') || '' }),
      }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['fee-ledger'] });
    },
    onError: (e: any) => setErr(e.message),
  });

  const L = data?.ledger;
  return (
    <Modal title={`${row.name} · ${row.admissionNo}`} onClose={onClose} xl>
      {!data ? (
        <div className="py-8 text-center text-[13px] font-semibold text-stone-500">
          Loading ledger…
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* schedule */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="chip">{PLAN_LABEL[L.plan] ?? L.plan}</span>
              <span className="chip">Gross {inr(L.gross)}</span>
              {L.discount > 0 && (
                <span className="chip">
                  <span className="chip-dot bg-pink-400" /> Sibling −{inr(L.discount)}
                </span>
              )}
              <span className="chip">
                Net <b>{inr(L.net)}</b>
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-honey-300/60">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-honey-100 text-left text-[11px] font-extrabold uppercase tracking-wide text-honey-800">
                    <th className="px-3 py-2">Instalment</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-honey-200/60">
                  {L.instalments.map((i: any) => (
                    <tr key={i.no} className="bg-cream-50">
                      <td className="px-3 py-2 font-bold">#{i.no}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-stone-600">
                        {fmtDate(i.dueDate)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">{inr(i.amount)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{inr(i.paid)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            i.status === 'PAID'
                              ? 'green'
                              : i.status.includes('OVERDUE')
                                ? 'red'
                                : i.status === 'PARTIAL'
                                  ? 'sky'
                                  : 'stone'
                          }
                        >
                          {i.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-honey-100 font-extrabold">
                    <td className="px-3 py-2" colSpan={2}>
                      Balance
                    </td>
                    <td className="px-3 py-2 text-right" colSpan={2}>
                      {inr(L.balance)}
                    </td>
                    <td className="px-3 py-2">
                      {L.overdue > 0 && <Badge tone="red">{inr(L.overdue)} overdue</Badge>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* receipts */}
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                Receipts
              </div>
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {data.receipts.length === 0 && (
                  <div className="text-[12px] font-semibold text-stone-500">No payments yet.</div>
                )}
                {data.receipts.map((r: any) => (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-honey-300/60 bg-cream-50 px-3 py-2 text-[12px]',
                      r.isCancelled && 'opacity-50',
                    )}
                  >
                    <ReceiptText className="h-3.5 w-3.5 shrink-0 text-honey-700" />
                    <span className="whitespace-nowrap font-bold">{r.receiptNo}</span>
                    {r.ledgerType === 'EVENING' && <Badge tone="violet">Evening</Badge>}
                    {r.isCancelled && <Badge tone="red">Cancelled</Badge>}
                    <span className="ml-auto font-extrabold">{inr(r.amount)}</span>
                    <span className="font-semibold text-stone-500">{r.mode}</span>
                    <button
                      className="btn-neo-icon !h-7 !w-7"
                      title="Print receipt"
                      onClick={() => openReceipt(r.id)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {canCancel && !r.isCancelled && (
                      <button
                        className="btn-neo-icon !h-7 !w-7"
                        title="Cancel receipt"
                        onClick={() => cancel.mutate(r.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* record payment */}
          <div className="rounded-2xl border border-honey-300/60 bg-cream-50 p-4">
            <div className="mb-3 font-heading text-[14px] font-extrabold">Record payment</div>
            {paid ? (
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <div className="text-[13px] font-extrabold text-emerald-700">
                  Payment recorded ✓
                </div>
                <div className="mt-1 text-[12.5px] font-bold">
                  {paid.receiptNo} · {inr(Number(paid.amount))}
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  <button className="btn-primary" onClick={() => openReceipt(paid.id)}>
                    <Printer className="mr-1.5 inline h-3.5 w-3.5" />
                    Print receipt
                  </button>
                  <button
                    className="btn-neo"
                    onClick={() => {
                      setPaid(null);
                      setForm({ ...form, amount: '', reference: '', remarks: '' });
                    }}
                  >
                    New payment
                  </button>
                </div>
                <div className="mt-2 text-[11px] font-semibold text-stone-500">
                  Receipt queued for parent WhatsApp (BSP live in Slice 7)
                </div>
              </div>
            ) : !canCollect ? (
              <div className="py-6 text-center text-[12.5px] font-semibold text-stone-500">
                Your role can view the ledger but not collect fees.
              </div>
            ) : (
              <>
                {err && <ErrorNote msg={err} />}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (₹)">
                    <input
                      className="input"
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </Field>
                  <Field label="Mode">
                    <select
                      className="input"
                      value={form.paymentMode}
                      onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                    >
                      {MODES.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Against instalment">
                    <select
                      className="input"
                      value={form.instalmentNo}
                      onChange={(e) => setForm({ ...form, instalmentNo: e.target.value })}
                    >
                      <option value="">—</option>
                      {L.instalments.map((i: any) => (
                        <option key={i.no} value={i.no}>
                          #{i.no} · due {fmtDate(i.dueDate)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ledger">
                    <select
                      className="input"
                      value={form.ledgerType}
                      onChange={(e) => setForm({ ...form, ledgerType: e.target.value })}
                    >
                      <option value="PRESCHOOL">Preschool (annual)</option>
                      <option value="EVENING">Evening centre (monthly)</option>
                    </select>
                  </Field>
                  <Field label="Reference (UPI/cheque)">
                    <input
                      className="input"
                      value={form.reference}
                      onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    />
                  </Field>
                  <Field label="Remarks">
                    <input
                      className="input"
                      value={form.remarks}
                      onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {L.instalments
                    .filter((i: any) => i.paid < i.amount)
                    .map((i: any) => (
                      <button
                        key={i.no}
                        className="chip hover:bg-honey-200"
                        onClick={() =>
                          setForm({
                            ...form,
                            amount: String(i.amount - i.paid),
                            instalmentNo: String(i.no),
                          })
                        }
                      >
                        Fill inst. #{i.no} · {inr(i.amount - i.paid)}
                      </button>
                    ))}
                </div>
                <button
                  className="btn-primary mt-4 w-full"
                  disabled={pay.isPending || !form.amount}
                  onClick={() => pay.mutate()}
                >
                  <IndianRupee className="mr-1.5 inline h-3.5 w-3.5" />
                  {pay.isPending
                    ? 'Recording…'
                    : `Collect ${form.amount ? inr(Number(form.amount)) : ''}`}
                </button>
                <div className="mt-2 text-center text-[10.5px] font-semibold text-stone-500">
                  Evening-centre payments stay on a separate ledger — never merged with preschool
                  fees.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────── Structures tab ─────────────────────────
function StructuresTab() {
  const L = useLabels();
  const { t: tr } = useI18n();
  const { user } = useAuth();
  const canEdit = ['FOUNDER', 'ACADEMIC_DIR'].includes(user!.role);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [err, setErr] = useState('');
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fee-structures'],
    queryFn: () => api('/fees/structures'),
  });

  const saveMut = useMutation({
    mutationFn: (b: any) => api('/fees/structures', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-structures'] });
      setEditing(null);
    },
    onError: (e: any) => setErr(e.message),
  });

  const cols = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'unit.code',
        header: L('Unit'),
        cell: ({ row }) => <span className="chip">{row.original.unit.code}</span>,
      },
      {
        accessorKey: 'programme.name',
        header: L('Programme'),
        cell: ({ row }) => <span className="font-bold">{row.original.programme.name}</span>,
      },
      {
        accessorKey: 'totalFee',
        header: L('Annual fee'),
        cell: ({ row }) => <span className="font-extrabold">{inr(row.original.totalFee)}</span>,
      },
      {
        id: 'split',
        header: L('Instalments (Plan A)'),
        cell: ({ row }) => (
          <span className="text-[12px] font-semibold text-stone-600">
            {inr(row.original.instalment1)} / {inr(row.original.instalment2)} /{' '}
            {inr(row.original.instalment3)}
          </span>
        ),
      },
      {
        accessorKey: 'siblingDiscountPct',
        header: L('Sibling %'),
        cell: ({ row }) => (
          <Badge tone="pink">{Number(row.original.siblingDiscountPct ?? 0)}%</Badge>
        ),
      },
      {
        accessorKey: 'locked',
        header: L('Status'),
        cell: ({ row }) => (
          <Badge tone={row.original.locked ? 'green' : 'honey'}>
            {row.original.locked ? 'Locked for AY' : 'Draft'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={cols}
        data={rows}
        isLoading={isLoading}
        title={tr('fees.structures')}
        searchPlaceholder="Search structures…"
        exportName="fee-structures"
        onRowClick={
          canEdit
            ? (r: any) => {
                setErr('');
                setEditing({ ...r });
              }
            : undefined
        }
      />
      {editing && (
        <Modal
          title={`${editing.unit.code} · ${editing.programme.name}`}
          onClose={() => setEditing(null)}
        >
          {err && <ErrorNote msg={err} />}
          {editing.locked && (
            <div className="mb-3 rounded-xl bg-honey-100 px-3 py-2 text-[12px] font-bold text-honey-800">
              This structure is locked for the AY — saving will keep it locked (Founder edit is
              audited).
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total annual fee (₹)">
              <input
                className="input"
                type="number"
                value={editing.totalFee}
                onChange={(e) => setEditing({ ...editing, totalFee: e.target.value })}
              />
            </Field>
            <Field label="Sibling discount %">
              <input
                className="input"
                type="number"
                value={editing.siblingDiscountPct ?? ''}
                onChange={(e) => setEditing({ ...editing, siblingDiscountPct: e.target.value })}
              />
            </Field>
            <Field label="Instalment 1 (Apr 10)">
              <input
                className="input"
                type="number"
                value={editing.instalment1 ?? ''}
                onChange={(e) => setEditing({ ...editing, instalment1: e.target.value })}
              />
            </Field>
            <Field label="Instalment 2 (Jul 10)">
              <input
                className="input"
                type="number"
                value={editing.instalment2 ?? ''}
                onChange={(e) => setEditing({ ...editing, instalment2: e.target.value })}
              />
            </Field>
            <Field label="Instalment 3 (Oct 10)">
              <input
                className="input"
                type="number"
                value={editing.instalment3 ?? ''}
                onChange={(e) => setEditing({ ...editing, instalment3: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-neo" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={saveMut.isPending}
              onClick={() =>
                saveMut.mutate({
                  unitId: editing.unitId,
                  programmeId: editing.programmeId,
                  totalFee: Number(editing.totalFee),
                  instalment1: Number(editing.instalment1 || 0),
                  instalment2: Number(editing.instalment2 || 0),
                  instalment3: Number(editing.instalment3 || 0),
                  siblingDiscountPct: Number(editing.siblingDiscountPct || 0),
                  unlock: true,
                  locked: editing.locked,
                })
              }
            >
              Save structure
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ───────────────────────── Reminders tab ─────────────────────────
function RemindersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canRun = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const { data: msgs = [] } = useQuery({
    queryKey: ['fee-reminders'],
    queryFn: () => api('/fees/reminders'),
  });
  const run = useMutation({
    mutationFn: () => api('/fees/reminders/run', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-reminders'] }),
  });
  const STAGE_TONE: Record<string, any> = {
    'T-5': 'sky',
    'T-0': 'honey',
    'T+3': 'violet',
    'T+7': 'red',
  };
  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <BellRing className="h-4 w-4 text-honey-700" />
        <span className="font-heading text-[15px] font-extrabold">Fee reminder queue</span>
        <span className="chip">{msgs.length}</span>
        <span className="text-[11.5px] font-semibold text-stone-500">
          Schedule: T-5 upcoming · T-0 due day · T+3 and T+7 overdue → parent WhatsApp (BSP live in
          Slice 7)
        </span>
        {canRun && (
          <button
            className="btn-primary ml-auto"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            <Send className="mr-1.5 inline h-3.5 w-3.5" />
            {run.isPending ? 'Scanning…' : 'Run reminder scan'}
          </button>
        )}
      </div>
      {run.data && (
        <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-bold text-emerald-700">
          Scan complete — {run.data.queued} new reminder(s) queued.
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {msgs.length === 0 && (
          <div className="col-span-full py-8 text-center text-[13px] font-semibold text-stone-500">
            No reminders queued yet — run a scan.
          </div>
        )}
        {msgs.map((m: any) => (
          <div key={m.id} className="rounded-xl border border-honey-300/60 bg-cream-50 px-3.5 py-3">
            <div className="flex items-center gap-2">
              {m.type === 'RECEIPT' ? (
                <Badge tone="green">Receipt</Badge>
              ) : (
                <Badge tone={STAGE_TONE[m.payload?.stage] ?? 'stone'}>
                  {m.payload?.stage ?? 'Reminder'}
                </Badge>
              )}
              <span className="ml-auto text-[10.5px] font-semibold text-stone-500">
                {fmtDate(m.createdAt)}
              </span>
            </div>
            <div className="mt-1.5 text-[12.5px] font-bold">
              {m.student ? `${m.student.firstName} ${m.student.lastName}` : m.payload?.child}
            </div>
            <div className="text-[11.5px] font-semibold text-stone-600">
              {m.type === 'RECEIPT'
                ? `${m.payload?.receiptNo} · ${inr(m.payload?.amount)}`
                : `Inst. #${m.payload?.instalmentNo} · ${inr(m.payload?.amountDue)} due ${fmtDate(m.payload?.dueDate)}`}
            </div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-stone-500">
              → {m.recipient} · {m.status === 'QUEUED' ? 'queued' : m.status.toLowerCase()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function Fees() {
  const L = useLabels();
  const { t: tr } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<'ledger' | 'structures' | 'reminders' | 'reports'>('ledger');
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fee-ledger'],
    queryFn: () => api('/fees/ledger'),
  });
  const { data: sm } = useQuery({ queryKey: ['fee-summary'], queryFn: () => api('/fees/summary') });

  const cols = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'admissionNo',
        header: L('Admission №'),
        cell: ({ row }) => (
          <span className="font-bold text-honey-800">{row.original.admissionNo}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: L('Student'),
        cell: ({ row }) => (
          <div>
            <span className="font-bold">{row.original.name}</span>
            {row.original.sibling && <Badge tone="pink">sibling</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'unit',
        header: L('Unit'),
        cell: ({ row }) => <span className="chip">{row.original.unit}</span>,
      },
      { id: 'programme', accessorFn: (r: any) => r.programme?.name, header: L('Programme') },
      {
        accessorKey: 'plan',
        header: L('Plan'),
        cell: ({ row }) => (
          <span className="text-[12px] font-semibold text-stone-600">
            {PLAN_LABEL[row.original.plan] ?? row.original.plan}
          </span>
        ),
      },
      {
        accessorKey: 'net',
        header: L('Net fee'),
        cell: ({ row }) => <span className="font-bold">{inr(row.original.net)}</span>,
      },
      {
        accessorKey: 'paid',
        header: L('Paid'),
        cell: ({ row }) => (
          <span className="font-semibold text-emerald-700">{inr(row.original.paid)}</span>
        ),
      },
      {
        accessorKey: 'balance',
        header: L('Balance'),
        cell: ({ row }) => (
          <span
            className={cn(
              'font-extrabold',
              row.original.balance > 0 ? 'text-rose-600' : 'text-emerald-700',
            )}
          >
            {inr(row.original.balance)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: L('Status'),
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status]} dot>
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title={tr('fees.title')}
        count="AY 2026-27"
        subtitle={tr('fees.subtitle')}
        action={
          <div className="seg">
            {(['ledger', 'structures', 'reminders', 'reports'] as const).map((t) => (
              <button
                key={t}
                className={cn('seg-item capitalize', tab === t && 'seg-item-active')}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      {sm && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="chip">
            <Landmark className="h-3 w-3 text-honey-700" /> Collected{' '}
            <b>{inr(sm.collectedTotal)}</b>
          </span>
          <span className="chip">
            This month <b>{inr(sm.collectedThisMonth)}</b>
          </span>
          <span className="chip">
            <span className="chip-dot bg-rose-400" /> Outstanding <b>{inr(sm.outstanding)}</b>
          </span>
          <span className="chip">
            <span className="chip-dot bg-red-500" /> Overdue <b>{inr(sm.overdue)}</b>
          </span>
          <span className="chip">{sm.receipts} receipts</span>
          {Object.entries(sm.byMode as Record<string, number>).map(([m, v]) => (
            <span key={m} className="chip hidden xl:inline-flex">
              {m} {inr(v)}
            </span>
          ))}
        </div>
      )}

      {tab === 'ledger' && (
        <DataTable
          columns={cols}
          data={rows}
          isLoading={isLoading}
          title={tr('fees.ledger')}
          searchPlaceholder="Search student / admission no…"
          exportName="fee-ledger"
          filterable={[
            { id: 'unit', label: L('Unit') },
            { id: 'status', label: L('Status') },
            { id: 'plan', label: L('Plan') },
          ]}
          onRowClick={(r: any) => setSelected(r)}
        />
      )}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'reminders' && <RemindersTab />}
      {tab === 'reports' && <ReportsTab />}

      {selected && <LedgerModal row={selected} onClose={() => setSelected(null)} />}
      {user!.role === 'TEACHER' && (
        <div className="mt-3 text-[11.5px] font-semibold text-stone-500">
          Teachers have read-only access to fees.
        </div>
      )}
    </div>
  );
}

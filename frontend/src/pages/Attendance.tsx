import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Lock,
  MessageSquareWarning,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';
import { ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';
import { cn } from '../lib/utils';
import { useI18n, useLabels } from '../lib/i18n';

const OVERRIDE_ROLES = ['CENTRE_HEAD', 'FOUNDER', 'ACADEMIC_DIR'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtT = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: 'P', cls: 'bg-emerald-500 text-white border-emerald-600' },
  ABSENT: { label: 'A', cls: 'bg-rose-500 text-white border-rose-600' },
  LEAVE: { label: 'L', cls: 'bg-sky-500 text-white border-sky-600' },
};

function initials(name: string) {
  return name
    .split(' ')
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ───────────────────────── Leave register + daily plan ─────────────────────────
const LEAVE_TYPES = ['PLANNED', 'SICK', 'FAMILY', 'OTHER'];

function LeavePanel() {
  const L = useLabels();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [form, setForm] = useState<any>({
    studentId: '',
    fromDate: todayISO(),
    toDate: todayISO(),
    type: 'PLANNED',
    reason: '',
  });
  const [err, setErr] = useState('');
  const [students, setStudents] = useState<any[]>([]);

  useEffect(() => {
    api('/students')
      .then((rows: any[]) => setStudents(rows))
      .catch(() => null);
  }, []);

  const { data: rows = [] } = useQuery({
    queryKey: ['leaves', status],
    queryFn: () => api(`/leaves${status ? `?status=${status}` : ''}`),
  });
  const { data: plan } = useQuery({
    queryKey: ['att-daily-plan'],
    queryFn: () => api('/attendance/daily-plan'),
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () => api('/leaves', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setForm({ ...form, studentId: '', reason: '' });
      qc.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (e: any) => setErr(e.message),
  });
  const decide = useMutation({
    mutationFn: ({ id, kind }: any) =>
      api(`/leaves/${id}/${kind}`, { method: 'POST', body: JSON.stringify({ note: '' }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
    onError: (e: any) => setErr(e.message),
  });

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] px-4 py-3">
          <div>
            <b className="text-[13.5px]">Leave register</b>
            <p className="text-[11px] text-[color:var(--txt3)]">
              Approved leave silences the absence alert for those days.
            </p>
          </div>
          <div className="seg">
            {['PENDING', 'APPROVED', 'REJECTED', ''].map((v) => (
              <button
                key={v || 'all'}
                className={cn('seg-item', status === v && 'seg-item-active')}
                onClick={() => setStatus(v)}
              >
                {v ? v.toLowerCase() : 'all'}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[320px] divide-y divide-[color:var(--line)] overflow-auto">
          {rows.map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold">
                  {l.student?.firstName} {l.student?.lastName}
                  <span className="ml-2 font-semibold text-[color:var(--txt3)]">
                    {l.student?.admissionNo}
                  </span>
                </div>
                <div className="text-[11px] text-[color:var(--txt3)]">
                  {new Date(l.fromDate).toLocaleDateString('en-IN')} →{' '}
                  {new Date(l.toDate).toLocaleDateString('en-IN')} · {l.type.toLowerCase()} ·{' '}
                  {l.source.toLowerCase()} · {l.reason}
                </div>
              </div>
              <Badge
                tone={
                  l.status === 'APPROVED'
                    ? 'green'
                    : l.status === 'PENDING'
                      ? 'honey'
                      : l.status === 'REJECTED'
                        ? 'red'
                        : 'stone'
                }
              >
                {l.status}
              </Badge>
              {l.status === 'PENDING' && (
                <div className="flex gap-1">
                  <button
                    className="btn-neo !px-2 !py-1 text-[11.5px]"
                    onClick={() => decide.mutate({ id: l.id, kind: 'approve' })}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-neo !px-2 !py-1 text-[11.5px]"
                    onClick={() => decide.mutate({ id: l.id, kind: 'reject' })}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {!rows.length && (
            <div className="px-4 py-8 text-center text-[12.5px] font-semibold text-[color:var(--txt3)]">
              No leave applications in this view.
            </div>
          )}
        </div>

        <div className="border-t border-[color:var(--line)] px-4 py-3">
          <b className="text-[12.5px]">Log a phone-in leave</b>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              className="input"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            >
              <option value="">Student…</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} · {s.admissionNo}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            />
            <input
              type="date"
              className="input"
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            />
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase()}
                </option>
              ))}
            </select>
            <input
              className="input lg:col-span-3"
              placeholder={L('Reason (visible to the family)')}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <button
              className="btn-primary"
              disabled={!form.studentId || !form.reason.trim()}
              onClick={() => {
                setErr('');
                create.mutate();
              }}
            >
              Log leave
            </button>
          </div>
          <ErrorNote msg={err} />
        </div>
      </div>

      <aside className="card p-4">
        <b className="text-[13px]">Today's attendance plan</b>
        <p className="mt-1 text-[11px] text-[color:var(--txt3)]">
          Derived at 05:00 IST for every active batch. If a register is never submitted, the child
          safety chain still runs and the Centre Head is alerted.
        </p>
        <div className="mt-3 space-y-2">
          {(plan?.plans ?? [])
            .filter((p: any) => !p.skip)
            .slice(0, 12)
            .map((p: any) => (
              <div
                key={p.batchId}
                className="rounded-lg border border-[color:var(--line)] px-3 py-2"
              >
                <div className="flex items-center justify-between text-[12px] font-bold">
                  <span className="truncate">{p.name}</span>
                  <span className={cn('chip', p.past && 'opacity-70')}>{fmtT(p.absenceMsgAt)}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] font-semibold text-[color:var(--txt3)]">
                  lock {fmtT(p.lockAt)} · alert {fmtT(p.absenceMsgAt)} · call {fmtT(p.adminCallAt)}
                </div>
              </div>
            ))}
          {!plan?.plans?.length && (
            <div className="text-[12px] font-semibold text-[color:var(--txt3)]">
              No active batches today.
            </div>
          )}
        </div>
        {plan?.queueAvailable === false && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            Redis is unavailable — the plan is computed but jobs stay in-process. Alert the ops
            team.
          </p>
        )}
      </aside>
    </div>
  );
}

// ───────────────────────── Term report: per batch, per child ─────────────────────────
/**
 * The daily cards answer "what happened today". This panel answers the question
 * a Centre Head actually gets asked on a call — "how has my child been attending
 * this term, and who should we be ringing?" — straight from
 * `GET /attendance/reports/batch/:id`.
 */
function ReportsPanel({ batches }: { batches: { batchId: string; name: string; unit: string }[] }) {
  const [batchId, setBatchId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO());
  useEffect(() => {
    if (!batchId && batches.length) setBatchId(batches[0].batchId);
  }, [batches, batchId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['att-report', batchId, from, to],
    queryFn: () => api(`/attendance/reports/batch/${batchId}?from=${from}&to=${to}`),
    enabled: !!batchId,
  });

  const pctTone = (p: number) => (p >= 90 ? 'green' : p >= 75 ? 'honey' : 'red');

  return (
    <div className="card mt-4 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BarChart3 className="h-4 w-4 text-honey-700" />
        <span className="font-heading text-[14px] font-extrabold">Attendance report</span>
        {data?.totals && (
          <span className="chip ml-auto">
            {data.totals.present}/{data.totals.marked} present · {data.totals.percent}%
          </span>
        )}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <label className="text-[11.5px] font-bold text-stone-600">
          Batch
          <select
            className="input mt-1"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.unit} · {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11.5px] font-bold text-stone-600">
          From
          <input
            type="date"
            className="input mt-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-[11.5px] font-bold text-stone-600">
          To
          <input
            type="date"
            className="input mt-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {error && <ErrorNote msg={(error as Error).message} />}
      {isLoading && <div className="py-4 text-[13px] font-semibold text-stone-500">Loading…</div>}
      {data?.students?.length > 0 && (
        <div className="divide-y divide-honey-300/40">
          {data.students.map((s: any) => (
            <div key={s.studentId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{s.name}</div>
                <div className="text-[11px] font-semibold text-stone-500">{s.admissionNo}</div>
              </div>
              <span className="text-[11.5px] font-semibold text-stone-500">
                P {s.present} · A {s.absent} · L {s.leave}
              </span>
              <Badge tone={pctTone(s.percent)}>{s.percent}%</Badge>
            </div>
          ))}
        </div>
      )}
      {data?.students?.length === 0 && (
        <div className="py-6 text-center text-[12.5px] font-semibold text-stone-500">
          No students in this batch.
        </div>
      )}
      <p className="mt-3 text-[11px] font-semibold text-stone-500">
        Percentages are over marked days — holidays and unopened registers never count as absences.
        Weakest attendance is listed first.
      </p>
    </div>
  );
}

export default function Attendance() {
  const L = useLabels();
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isHO = HO_ROLES.includes(user!.role);
  const canOverride = OVERRIDE_ROLES.includes(user!.role);
  const [date, setDate] = useState(todayISO());
  const [batchId, setBatchId] = useState('');
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [savedAt, setSavedAt] = useState<any>(null);

  const { data: summary = [] } = useQuery({
    queryKey: ['att-summary', date],
    queryFn: () => api(`/attendance/summary?date=${date}`),
  });
  useEffect(() => {
    if (!batchId && summary.length) setBatchId(summary[0].batchId);
  }, [summary, batchId]);

  const { data: roster, isLoading } = useQuery({
    queryKey: ['att-roster', batchId, date],
    queryFn: () => api(`/attendance/roster?batchId=${batchId}&date=${date}`),
    enabled: !!batchId,
  });
  useEffect(() => {
    if (roster) {
      const m: Record<string, string> = {};
      roster.roster.forEach((s: any) => {
        m[s.id] = s.status;
      });
      setMarks(m);
      setSavedAt(null);
      setErr('');
    }
  }, [roster]);

  const { data: messages = [] } = useQuery({
    queryKey: ['att-messages'],
    queryFn: () => api('/attendance/messages'),
    enabled: canOverride || user!.role === 'COORDINATOR',
    refetchInterval: 20000,
  });

  const save = useMutation({
    mutationFn: () =>
      api('/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({
          batchId,
          date,
          entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
          ...(roster?.locked ? { overrideReason: reason } : {}),
        }),
      }),
    onSuccess: (r) => {
      setSavedAt(r);
      setErr('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['att-roster'] });
      qc.invalidateQueries({ queryKey: ['att-summary'] });
      qc.invalidateQueries({ queryKey: ['att-messages'] });
    },
    onError: (e: any) => setErr(e.message),
  });

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LEAVE: 0 };
    Object.values(marks).forEach((s) => {
      (c as any)[s]++;
    });
    return c;
  }, [marks]);

  const locked = roster?.locked;
  const lockedAndCannot = locked && !canOverride;

  return (
    <div>
      <PageHeader
        title={t('attendance.title')}
        count={date === todayISO() ? t('attendance.today') : date}
        subtitle={t('attendance.subtitle')}
        action={
          <label className="btn-neo flex items-center gap-2 cursor-pointer">
            <CalendarDays className="h-4 w-4 text-honey-700" />
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-[13px] font-bold outline-none"
            />
          </label>
        }
      />

      {/* ── Batch cards ── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((b: any) => (
          <button
            key={b.batchId}
            onClick={() => setBatchId(b.batchId)}
            className={cn(
              'card p-4 text-left transition-all',
              batchId === b.batchId ? 'ring-2 ring-honey-500' : 'hover:-translate-y-0.5',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-extrabold">{b.name}</span>
              <span className="chip">{b.unit}</span>
            </div>
            <div className="mt-1 text-[11.5px] font-semibold text-stone-600">
              {b.startTime} · {b.programme?.name}
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[11.5px] font-bold">
              {b.marked === 0 ? (
                <Badge tone={b.locked ? 'red' : 'stone'}>
                  {b.locked ? 'Unmarked · locked' : 'Not marked yet'}
                </Badge>
              ) : (
                <>
                  <span className="text-emerald-700">{b.present} P</span>
                  <span className="text-rose-600">{b.absent} A</span>
                  <span className="text-sky-700">{b.leave} L</span>
                  <span className="text-stone-500">/ {b.total}</span>
                </>
              )}
              {b.locked && <Lock className="ml-auto h-3.5 w-3.5 text-stone-500" />}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        {/* ── Roster ── */}
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-honey-300/50 px-5 py-4">
            <div>
              <div className="font-heading text-[15px] font-extrabold">
                {roster ? `${roster.batch.name} · ${roster.batch.unit}` : 'Pick a batch'}
              </div>
              {roster && (
                <div className="mt-0.5 text-[11.5px] font-semibold text-stone-600">
                  Starts {roster.batch.startTime} IST · locks {fmtT(roster.lockAt)} · absence alerts{' '}
                  {fmtT(roster.absenceMsgAt)} · admin calls {fmtT(roster.adminCallAt)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="chip">
                <span className="chip-dot bg-emerald-400" /> {counts.PRESENT} P
              </span>
              <span className="chip">
                <span className="chip-dot bg-rose-400" /> {counts.ABSENT} A
              </span>
              <span className="chip">
                <span className="chip-dot bg-sky-400" /> {counts.LEAVE} L
              </span>
              <button
                className="btn-neo text-[12px]"
                disabled={lockedAndCannot}
                onClick={() =>
                  setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, 'PRESENT'])))
                }
              >
                All present
              </button>
            </div>
          </div>

          {locked && (
            <div
              className={cn(
                'flex items-start gap-2.5 px-5 py-3 text-[12.5px] font-semibold',
                canOverride ? 'bg-honey-100 text-honey-800' : 'bg-rose-50 text-rose-700',
              )}
            >
              {canOverride ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {canOverride ? (
                <span>
                  Attendance locked at {fmtT(roster.lockAt)} IST. As{' '}
                  {user!.role === 'CENTRE_HEAD' ? 'Centre Head' : 'HO'}, you can still edit — an
                  override reason is required and audited.
                </span>
              ) : (
                <span>
                  Attendance locked at {fmtT(roster.lockAt)} IST (batch start + 30 min). Ask your
                  Centre Head to override.
                </span>
              )}
            </div>
          )}

          <div className="divide-y divide-honey-200/60">
            {isLoading && (
              <div className="px-5 py-8 text-center text-[13px] font-semibold text-stone-500">
                Loading roster…
              </div>
            )}
            {roster?.roster.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-honey-200 to-honey-300 text-[11px] font-extrabold text-honey-800">
                  {initials(`${s.firstName} ${s.lastName}`)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">
                    {s.firstName} {s.lastName}
                  </div>
                  <div className="text-[11px] font-semibold text-stone-500">
                    {s.admissionNo}
                    {s.overridden && ' · ✏️ overridden'}
                  </div>
                </div>
                {!s.marked && marks[s.id] === 'ABSENT' && (
                  <Badge tone="stone">unmarked → absent</Badge>
                )}
                <div className="flex gap-1.5">
                  {(['PRESENT', 'ABSENT', 'LEAVE'] as const).map((st) => (
                    <button
                      key={st}
                      disabled={lockedAndCannot}
                      onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))}
                      title={st}
                      className={cn(
                        'h-8 w-8 rounded-lg border text-[12px] font-extrabold transition-all disabled:opacity-40',
                        marks[s.id] === st
                          ? STATUS_META[st].cls
                          : 'border-honey-300 bg-cream-50 text-stone-500 hover:bg-honey-100',
                      )}
                    >
                      {STATUS_META[st].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {roster && roster.roster.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] font-semibold text-stone-500">
                No active students in this batch.
              </div>
            )}
          </div>

          <div className="border-t border-honey-300/50 px-5 py-4">
            {err && <ErrorNote msg={err} />}
            {locked && canOverride && (
              <input
                className="input mb-3"
                placeholder={L('Override reason (required — goes to audit log)')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <div className="flex items-center justify-between gap-3">
              {savedAt ? (
                <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Saved · absence scan{' '}
                  {new Date(savedAt.absenceScanAt) <= new Date()
                    ? 'ran immediately'
                    : `queued for ${fmtT(savedAt.absenceScanAt)}`}
                </span>
              ) : (
                <span className="text-[11.5px] font-semibold text-stone-500">
                  <AlarmClock className="mr-1 inline h-3.5 w-3.5" />
                  Absent students trigger WhatsApp alerts at lock + 30 min, admin call list at lock
                  + 2 h, escalation on day 3.
                </span>
              )}
              <button
                className="btn-primary"
                disabled={save.isPending || lockedAndCannot || !roster}
                onClick={() => save.mutate()}
              >
                {save.isPending ? 'Saving…' : locked ? 'Save with override' : 'Save attendance'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Message queue ── */}
        {(canOverride || user!.role === 'COORDINATOR') && (
          <div className="card self-start p-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-honey-700" />
              <span className="font-heading text-[14px] font-extrabold">Alert queue</span>
              <span className="chip ml-auto">{messages.length}</span>
            </div>
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="py-6 text-center text-[12px] font-semibold text-stone-500">
                  No alerts yet — alerts appear after a batch's absence scan runs.
                </div>
              )}
              {messages.map((m: any) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-honey-300/60 bg-cream-50 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        m.type === 'ESCALATION_3DAY'
                          ? 'red'
                          : m.type === 'ADMIN_CALL'
                            ? 'violet'
                            : 'honey'
                      }
                    >
                      {m.type === 'ABSENCE_ALERT'
                        ? 'Absence'
                        : m.type === 'ADMIN_CALL'
                          ? 'Admin call'
                          : '3-day escalation'}
                    </Badge>
                    <span className="ml-auto text-[10.5px] font-semibold text-stone-500">
                      {fmtT(m.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] font-bold">
                    {m.student ? `${m.student.firstName} ${m.student.lastName}` : m.payload?.child}
                  </div>
                  <div className="text-[11px] font-semibold text-stone-500">
                    {m.channel === 'WHATSAPP'
                      ? `→ ${m.recipient} · ${m.status === 'QUEUED' ? 'queued (BSP live in Slice 7)' : m.status.toLowerCase()}`
                      : 'internal task'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <LeavePanel />
      <ReportsPanel batches={summary} />
      {isHO && (
        <div className="mt-4 flex items-center gap-1.5 text-[11.5px] font-semibold text-stone-500">
          <Users className="h-3.5 w-3.5" /> HO view — you're seeing batches across all units. Unit
          staff only see their own.
        </div>
      )}
    </div>
  );
}

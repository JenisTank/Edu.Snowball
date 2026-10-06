import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck2, CheckCircle2, EyeOff, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

const RESULT_LABEL: Record<string, string> = {
  EP: 'EP · Excellent Progress', GP: 'GP · Good Progress', SP: 'SP · Steady Progress',
  NP: 'NP · Needs Practice', ND: 'ND · Needs Development',
};
const RECO_LABEL: Record<string, string> = {
  READY: 'Ready', READY_WITH_SUPPORT: 'Ready with support', ALTERNATE_LEVEL: 'Alternate level',
};
const PLAN_LABEL: Record<string, string> = { PLAN_A: 'Plan A · 3 inst.', PLAN_B: 'Plan B · 2 inst.', PLAN_C: 'Plan C · Full' };

function dfState(s: any): { label: string; tone: any; step: number } {
  const df = s.discoveryFlights?.[0];
  if (!df) return { label: 'DF not scheduled', tone: 'stone', step: 0 };
  if (!df.resultCode) return { label: 'DF scheduled', tone: 'sky', step: 1 };
  if (!df.approvedAt) return { label: `${df.resultCode} · awaiting approval`, tone: 'honey', step: 2 };
  return { label: `${df.resultCode} · approved`, tone: 'green', step: 3 };
}

function StudentModal({ student, onClose }: { student: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const df = student.discoveryFlights?.[0];
  const state = dfState(student);
  const canApprove = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => api('/batches') });
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any>({ resultCode: 'GP', recommendation: 'READY', notes: '' });
  const [confirmForm, setConfirmForm] = useState<any>({ batchId: '', instalmentPlan: student.instalmentPlan ?? 'PLAN_B' });
  const [confirmed, setConfirmed] = useState<any>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admissions'] });
  const schedule = useMutation({
    mutationFn: () => api(`/students/${student.id}/discovery`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => { refresh(); onClose(); }, onError: (e: any) => setErr(e.message),
  });
  const record = useMutation({
    mutationFn: () => api(`/discovery/${df.id}/result`, { method: 'POST', body: JSON.stringify(result) }),
    onSuccess: () => { refresh(); onClose(); }, onError: (e: any) => setErr(e.message),
  });
  const approve = useMutation({
    mutationFn: () => api(`/discovery/${df.id}/approve`, { method: 'POST' }),
    onSuccess: () => { refresh(); onClose(); }, onError: (e: any) => setErr(e.message),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/students/${student.id}/confirm`, { method: 'POST', body: JSON.stringify(confirmForm) }),
    onSuccess: (r) => { qc.invalidateQueries(); setConfirmed(r); }, onError: (e: any) => setErr(e.message),
  });

  if (confirmed) {
    return (
      <Modal title="Admission confirmed 🎉" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-100/70 px-4 py-3 text-center">
            <div className="text-lg font-heading font-extrabold text-emerald-700">{confirmed.admissionNo}</div>
            <div className="text-xs font-semibold text-emerald-600">{confirmed.firstName} {confirmed.lastName} · {confirmed.batch.name}</div>
          </div>
          <div className="neo-inset p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Attendance register</span><span className="font-bold text-emerald-600">Activated</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Fee ledger</span><span className="font-bold">activates in Slice 5</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Parent portal account</span><span className="font-bold">activates in Slice 6</span></div>
          </div>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  const unitBatches = (batches ?? []).filter((b: any) => b.unit.code === student.unit.code && b.isActive);

  return (
    <Modal title={`${student.firstName} ${student.lastName} — ${student.admissionNo}`} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="sky">{student.unit.code}</Badge>
        <Badge tone="honey">{student.programme?.name}</Badge>
        <Badge tone={state.tone} dot>{state.label}</Badge>
        {student.siblingGroup && <Badge tone="violet"><Sparkles className="h-3 w-3" /> Sibling — HO-rate concession</Badge>}
        <Badge tone="stone">{PLAN_LABEL[student.instalmentPlan] ?? '—'}</Badge>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-xl bg-stone-200/50 px-3.5 py-2.5 text-[11px] font-semibold text-stone-600">
        <EyeOff className="h-4 w-4 shrink-0" />
        Discovery Flight results are strictly internal — never visible to parents (spec rule).
      </div>

      {/* Step 1: schedule */}
      {state.step === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Next step: schedule the Discovery Flight readiness interaction.</p>
          <button className="btn-primary w-full" disabled={schedule.isPending} onClick={() => schedule.mutate()}>
            <CalendarCheck2 className="h-4 w-4" /> Schedule Discovery Flight (today)
          </button>
        </div>
      )}

      {/* Step 2: record result */}
      {state.step === 1 && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Result code">
              <select className="input" value={result.resultCode} onChange={e => setResult({ ...result, resultCode: e.target.value })}>
                {Object.entries(RESULT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Recommendation">
              <select className="input" value={result.recommendation} onChange={e => setResult({ ...result, recommendation: e.target.value })}>
                {Object.entries(RECO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Observer notes"><textarea className="input" rows={3} value={result.notes} onChange={e => setResult({ ...result, notes: e.target.value })} /></Field>
          <button className="btn-primary w-full" disabled={record.isPending} onClick={() => record.mutate()}>Record result</button>
        </div>
      )}

      {/* Step 3: approval gate */}
      {state.step === 2 && (
        <div className="space-y-3">
          <div className="neo-inset p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Result</span><span className="font-bold">{RESULT_LABEL[df.resultCode]}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Recommendation</span><span className="font-bold">{RECO_LABEL[df.recommendation] ?? df.recommendation}</span></div>
            {df.notes && <div className="pt-1 text-stone-600">{df.notes}</div>}
          </div>
          {canApprove
            ? <button className="btn-primary w-full" disabled={approve.isPending} onClick={() => approve.mutate()}><ShieldCheck className="h-4 w-4" /> Approve (Centre Head gate)</button>
            : <p className="text-xs font-semibold text-honey-700">Awaiting Centre Head approval.</p>}
        </div>
      )}

      {/* Step 4: confirm admission */}
      {state.step === 3 && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch (live seat tracker)">
              <select className="input" value={confirmForm.batchId} onChange={e => setConfirmForm({ ...confirmForm, batchId: e.target.value })}>
                <option value="">— pick batch —</option>
                {unitBatches.map((b: any) => {
                  const left = b.capacity - (b._count?.students ?? 0);
                  return <option key={b.id} value={b.id} disabled={left <= 0}>{b.name} · {left > 0 ? `${left} seats left` : 'FULL'}</option>;
                })}
              </select>
            </Field>
            <Field label="Instalment plan">
              <select className="input" value={confirmForm.instalmentPlan} onChange={e => setConfirmForm({ ...confirmForm, instalmentPlan: e.target.value })}>
                {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn-primary w-full" disabled={!confirmForm.batchId || confirm.isPending} onClick={() => confirm.mutate()}>
            <Rocket className="h-4 w-4" /> Confirm admission — generate admission number
          </button>
        </div>
      )}

      <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
    </Modal>
  );
}

export default function Admissions() {
  const { data, isLoading } = useQuery({ queryKey: ['admissions'], queryFn: () => api('/admissions') });
  const [open, setOpen] = useState<any>(null);
  const rows = data ?? [];

  const counts = {
    total: rows.length,
    noDf: rows.filter((s: any) => dfState(s).step === 0).length,
    scheduled: rows.filter((s: any) => dfState(s).step === 1).length,
    approval: rows.filter((s: any) => dfState(s).step === 2).length,
    ready: rows.filter((s: any) => dfState(s).step === 3).length,
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'child', header: 'Child', accessorFn: (r: any) => `${r.firstName} ${r.lastName} ${r.admissionNo}`,
      cell: ({ row }) => (
        <div>
          <div className="font-bold text-[13px]">{row.original.firstName} {row.original.lastName}
            {row.original.siblingGroup && <Sparkles className="ml-1.5 inline h-3.5 w-3.5 text-honey-500" />}
          </div>
          <div className="text-[11px] text-stone-500">{row.original.admissionNo} · reg {fmtDate(row.original.createdAt)}</div>
        </div>
      ),
    },
    { id: 'unit', header: 'Unit', accessorFn: (r: any) => r.unit.code },
    {
      id: 'programme', header: 'Programme', accessorFn: (r: any) => r.programme?.name ?? '',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: row.original.programme?.levelColour }} />
          {row.original.programme?.name}
        </span>
      ),
    },
    { id: 'plan', header: 'Plan (auto)', accessorFn: (r: any) => PLAN_LABEL[r.instalmentPlan] ?? '—' },
    {
      id: 'df', header: 'Discovery Flight', accessorFn: (r: any) => dfState(r).label,
      cell: ({ row }) => { const s = dfState(row.original); return <Badge tone={s.tone} dot>{s.label}</Badge>; },
    },
    {
      id: 'next', header: 'Next step', accessorFn: (r: any) => dfState(r).step,
      cell: ({ row }) => {
        const step = dfState(row.original).step;
        const labels = ['Schedule DF', 'Record result', 'CH approval', 'Confirm admission'];
        return <span className={cn('text-xs font-bold', step === 3 ? 'text-emerald-600' : 'text-honey-700')}>{labels[step]} →</span>;
      },
    },
    { id: 'source', header: 'Inquiry', accessorFn: (r: any) => r.lead?.inquiryNo ?? '—', cell: ({ getValue }) => <span className="text-[11px] text-stone-500">{getValue() as string}</span> },
  ], []);

  return (
    <div>
      <PageHeader
        title="Admissions" count={`${rows.length} in pipeline`}
        subtitle="Stage-2 registration → Discovery Flight → CH approval → confirmation"
      />
      <div className="mb-4 flex flex-wrap gap-2.5">
        <span className="chip">Registered <b>{counts.total}</b></span>
        <span className="chip"><span className="chip-dot bg-stone-300" /> DF pending <b>{counts.noDf}</b></span>
        <span className="chip"><span className="chip-dot bg-sky-400" /> DF scheduled <b>{counts.scheduled}</b></span>
        <span className="chip"><span className="chip-dot bg-honey-400" /> Awaiting approval <b>{counts.approval}</b></span>
        <span className="chip"><span className="chip-dot bg-emerald-400" /> Ready to confirm <b className="text-emerald-600">{counts.ready}</b></span>
      </div>
      <DataTable
        columns={columns} data={rows} isLoading={isLoading}
        title="Admission Pipeline" searchPlaceholder="Search registrations…" exportName="admissions"
        filterable={[{ id: 'unit', label: 'Unit' }, { id: 'programme', label: 'Programme' }, { id: 'df', label: 'DF status' }]}
        onRowClick={row => setOpen(row)}
      />
      {rows.length === 0 && !isLoading && (
        <p className="mt-3 text-xs text-stone-500">No registrations pending — register a lead from First Buzz CRM → lead → Start Stage-2 Registration.</p>
      )}
      {open && <StudentModal student={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { FileBadge, Lock, Printer, ShieldCheck } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth } from '../lib/auth';

export default function Certificates() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canIssue = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const [issuing, setIssuing] = useState<any>(null); // template being issued
  const [form, setForm] = useState<any>({ studentId: '', event: '', reason: '', noDuesConfirmed: false });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);

  const { data: templates = [] } = useQuery({ queryKey: ['cert-templates'], queryFn: () => api('/certificates/templates') });
  const { data: issued = [], isLoading } = useQuery({ queryKey: ['certs'], queryFn: () => api('/certificates') });
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: () => api('/students') });

  const issue = useMutation({
    mutationFn: () => api('/certificates/issue', { method: 'POST', body: JSON.stringify({ ...form, type: issuing.type }) }),
    onSuccess: (r) => { setDone(r); setErr(''); qc.invalidateQueries({ queryKey: ['certs'] }); },
    onError: (e: any) => setErr(e.message),
  });

  const cols = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'serialNo', header: 'Serial №', cell: ({ row }) => <span className="font-bold text-honey-800">{row.original.serialNo}</span> },
    { id: 'student', accessorFn: (r: any) => `${r.student.firstName} ${r.student.lastName}`, header: 'Student', cell: ({ getValue }) => <span className="font-bold">{getValue() as string}</span> },
    { id: 'unit', accessorFn: (r: any) => r.student.unit.code, header: 'Unit', cell: ({ getValue }) => <span className="chip">{getValue() as string}</span> },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge tone={row.original.type === 'TC' ? 'red' : 'honey'}>{row.original.type}</Badge> },
    { accessorKey: 'issuedAt', header: 'Issued', cell: ({ row }) => <span className="text-[12px] font-semibold text-stone-600">{fmtDate(row.original.issuedAt)}</span> },
    { id: 'print', header: '', cell: ({ row }) => (
      <button className="btn-neo-icon" title="Print" onClick={e => { e.stopPropagation(); window.open(`/api/certificates/${row.original.id}/print`, '_blank'); }}>
        <Printer className="h-3.5 w-3.5" />
      </button>
    ) },
  ], []);

  return (
    <div>
      <PageHeader
        title="Certificates" count={`${issued.length} issued`}
        subtitle="7 Head-Office-locked templates · serial-numbered · TC requires cleared fees + No-Dues confirmation"
      />

      {/* template gallery */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t: any) => (
          <div key={t.type} className="card flex flex-col p-4">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{t.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-extrabold">{t.name}</div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-stone-500"><Lock className="h-2.5 w-2.5" /> HO-locked wording</div>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 flex-1 text-[11px] font-semibold leading-relaxed text-stone-500">{t.body.replace(/\{child\}/g, '…').replace(/\{[a-z]+\}/gi, '…')}</p>
            {canIssue && (
              <button className="btn-neo mt-3 text-[12px]" onClick={() => { setErr(''); setDone(null); setForm({ studentId: '', event: '', reason: '', noDuesConfirmed: false }); setIssuing(t); }}>
                <FileBadge className="mr-1.5 inline h-3.5 w-3.5" />Issue
              </button>
            )}
          </div>
        ))}
      </div>

      <DataTable columns={cols} data={issued} isLoading={isLoading} title="Issued certificates"
        searchPlaceholder="Search serial / student…" exportName="certificates"
        filterable={[{ id: 'type', label: 'Type' }, { id: 'unit', label: 'Unit' }]} />

      {issuing && (
        <Modal title={`${issuing.icon} Issue ${issuing.name}`} onClose={() => setIssuing(null)}>
          {done ? (
            <div className="rounded-xl bg-emerald-50 p-5 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600" />
              <div className="mt-2 text-[14px] font-extrabold text-emerald-700">Certificate issued</div>
              <div className="mt-0.5 text-[12.5px] font-bold">{done.serialNo}</div>
              <div className="mt-3 flex justify-center gap-2">
                <button className="btn-primary" onClick={() => window.open(`/api/certificates/${done.id}/print`, '_blank')}><Printer className="mr-1.5 inline h-3.5 w-3.5" />Print</button>
                <button className="btn-neo" onClick={() => setIssuing(null)}>Close</button>
              </div>
            </div>
          ) : (
            <>
              {err && <ErrorNote msg={err} />}
              <div className="space-y-3">
                <Field label="Student">
                  <select className="input" value={form.studentId} onChange={e => setForm({ ...form, studentId: e.target.value })}>
                    <option value="">Select student…</option>
                    {students.filter((s: any) => s.status === 'ACTIVE').map((s: any) => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName} · {s.admissionNo}</option>
                    ))}
                  </select>
                </Field>
                {issuing.type === 'PARTICIPATION' && <Field label="Event name"><input className="input" value={form.event} onChange={e => setForm({ ...form, event: e.target.value })} placeholder="Annual Day 2026" /></Field>}
                {issuing.type === 'APPRECIATION' && <Field label="Reason"><input className="input" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="helping friends in class" /></Field>}
                {issuing.type === 'TC' && (
                  <div className="rounded-xl bg-rose-50 p-3">
                    <div className="text-[12px] font-bold text-rose-700">Transfer Certificate is gated:</div>
                    <ul className="mt-1 list-inside list-disc text-[11.5px] font-semibold text-rose-600">
                      <li>Fee ledger must be fully cleared (checked automatically)</li>
                      <li>Student status becomes TC_ISSUED</li>
                    </ul>
                    <label className="mt-2 flex items-center gap-2 text-[12px] font-bold">
                      <input type="checkbox" checked={form.noDuesConfirmed} onChange={e => setForm({ ...form, noDuesConfirmed: e.target.checked })} />
                      No-Dues confirmed (library, kit, transport)
                    </label>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="btn-neo" onClick={() => setIssuing(null)}>Cancel</button>
                <button className="btn-primary" disabled={issue.isPending || !form.studentId} onClick={() => issue.mutate()}>
                  {issue.isPending ? 'Issuing…' : 'Issue certificate'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

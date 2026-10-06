import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Eye, EyeOff, FileUp, Trash2 } from 'lucide-react';
import { api, apiUpload, fmtDate } from '../lib/api';
import { Modal, Field } from '../components/ui/Modal';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { useAuth, HO_ROLES } from '../lib/auth';

interface StudentRow {
  id: string; admissionNo: string; firstName: string; lastName: string;
  gender: string; dob: string; fatherName: string; fatherPhone: string;
  addressArea: string; status: string; admissionDate: string; instalmentPlan: string;
  programme: { name: string; tierName: string; levelColour: string } | null;
  batch: { name: string; shift: string } | null;
  unit: { code: string; name: string };
  siblingGroup: string | null;
}

const PLAN_LABEL: Record<string, string> = { PLAN_A: 'Plan A · 3 inst.', PLAN_B: 'Plan B · 2 inst.', PLAN_C: 'Plan C · Full' };


// ───────────────── Student documents vault ─────────────────
// Birth certificate, Aadhaar, photo, medical papers… Default visibility is
// STAFF; flipping a document to PARENT makes it appear in the parent app.
function DocumentsDrawer({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState('OTHER');
  const [title, setTitle] = useState('');
  const [parentVisible, setParentVisible] = useState(false);
  const [err, setErr] = useState('');

  const { data: types = [] } = useQuery({ queryKey: ['doc-types'], queryFn: () => api<string[]>('/documents/types') });
  const { data: docs = [], isLoading } = useQuery({ queryKey: ['docs', student.id], queryFn: () => api(`/documents?studentId=${student.id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['docs', student.id] });

  const upload = useMutation({
    mutationFn: async () => {
      const f = fileRef.current?.files?.[0];
      if (!f) throw new Error('Choose a file first');
      const fd = new FormData();
      fd.append('file', f);
      fd.append('studentId', student.id);
      fd.append('type', type);
      fd.append('title', title || f.name);
      fd.append('visibility', parentVisible ? 'PARENT' : 'STAFF');
      return apiUpload('/documents/upload', fd);
    },
    onSuccess: () => { setErr(''); setTitle(''); if (fileRef.current) fileRef.current.value = ''; refresh(); },
    onError: (e: any) => setErr(e.message),
  });
  const flip = useMutation({
    mutationFn: (d: any) => api(`/documents/${d.id}/visibility`, { method: 'POST', body: JSON.stringify({ visibility: d.visibility === 'PARENT' ? 'STAFF' : 'PARENT' }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/documents/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  return (
    <Modal title={`📁 ${student.firstName} ${student.lastName} — documents`} onClose={onClose} wide>
      {err && <p className="mb-3 rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}

      <div className="mb-4 rounded-2xl bg-cream-50 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="File" hint="PDF, JPG, PNG or WebP · max 10 MB">
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input !py-1.5 text-[12px]" />
          </Field>
          <Field label="Type">
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {types.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
          </Field>
          <Field label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Birth certificate" /></Field>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12px] font-bold text-stone-600">
            <input type="checkbox" checked={parentVisible} onChange={e => setParentVisible(e.target.checked)} />
            Share with the parent app
          </label>
          <button className="btn-primary !py-1.5 text-[12px]" disabled={upload.isPending} onClick={() => upload.mutate()}>
            <FileUp className="mr-1.5 inline h-3.5 w-3.5" />{upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {isLoading && <div className="py-4 text-center text-[12.5px] font-semibold text-stone-500">Loading…</div>}
      {!isLoading && docs.length === 0 && <div className="py-6 text-center text-[12.5px] font-semibold text-stone-400">No documents on file yet.</div>}
      <div className="space-y-1.5">
        {docs.map((d: any) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-200">
            <span className="text-lg">{d.mimeType?.startsWith('image/') ? '🖼️' : '📄'}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => window.open(`/api/documents/${d.id}/file`, '_blank')}>
              <div className="truncate text-[12.5px] font-extrabold">{d.title}</div>
              <div className="text-[10.5px] font-semibold text-stone-500">
                {d.type.replace(/_/g, ' ').toLowerCase()} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB · {fmtDate(d.createdAt)}
              </div>
            </button>
            <button className="btn-neo !py-1.5 text-[11px]" title="Toggle parent visibility" onClick={() => flip.mutate(d)}>
              {d.visibility === 'PARENT'
                ? <><Eye className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />parent</>
                : <><EyeOff className="mr-1 inline h-3.5 w-3.5 text-stone-400" />staff only</>}
            </button>
            <button className="btn-neo-icon" title="Delete" onClick={() => { if (window.confirm('Delete this document?')) remove.mutate(d.id); }}>
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function Students() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['students'], queryFn: () => api<StudentRow[]>('/students') });
  const isHO = HO_ROLES.includes(user?.role || '');
  const [docsFor, setDocsFor] = useState<StudentRow | null>(null);

  const students = data ?? [];
  const active = students.filter(s => s.status === 'ACTIVE').length;
  const siblings = students.filter(s => s.siblingGroup).length;
  const byUnit = ['U1', 'U2', 'U3'].map(c => ({ code: c, n: students.filter(s => s.unit.code === c).length }));

  const columns: ColumnDef<StudentRow, any>[] = [
    {
      id: 'student', header: 'Student',
      accessorFn: r => `${r.firstName} ${r.lastName} ${r.admissionNo}`,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-heading text-[12.5px] font-extrabold text-ink/70 shadow-neo-xs border border-black/5"
              style={{ background: s.programme?.levelColour ?? '#eee' }}
            >
              {s.firstName.charAt(0)}{s.lastName.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-[13px]">
                {s.firstName} {s.lastName} {s.siblingGroup && <span title="Sibling concession linked">👧👦</span>}
              </div>
              <div className="text-[11px] text-stone-500">{s.admissionNo}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'programme', header: 'Programme',
      accessorFn: r => r.programme?.name ?? '',
      cell: ({ row }) => {
        const p = row.original.programme;
        return p ? (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: p.levelColour }} />
            <div>
              <div className="text-[12.5px] font-semibold">{p.name}</div>
              <div className="text-[10.5px] text-stone-500">{p.tierName}</div>
            </div>
          </div>
        ) : '—';
      },
    },
    { id: 'batch', header: 'Batch', accessorFn: r => r.batch?.name ?? '—',
      cell: ({ row }) => <span className="text-[12px] text-stone-700">{row.original.batch?.name ?? '—'}</span> },
    ...(isHO ? [{
      id: 'unit', header: 'Unit', accessorFn: (r: StudentRow) => r.unit.code,
      cell: ({ row }: any) => <Badge tone="sky">{row.original.unit.code}</Badge>,
    } as ColumnDef<StudentRow, any>] : []),
    { id: 'parent', header: 'Parent Contact', accessorFn: r => `${r.fatherName} ${r.fatherPhone}`,
      cell: ({ row }) => (
        <div>
          <div className="text-[12.5px] font-medium">{row.original.fatherName}</div>
          <div className="text-[11px] text-stone-500">{row.original.fatherPhone}</div>
        </div>
      ) },
    { id: 'plan', header: 'Fee Plan', accessorFn: r => PLAN_LABEL[r.instalmentPlan] ?? '',
      cell: ({ getValue }) => <Badge tone="violet">{getValue() || '—'}</Badge> },
    { id: 'admitted', header: 'Admitted', accessorFn: r => r.admissionDate,
      cell: ({ getValue }) => <span className="text-[12px] text-stone-600">{getValue() ? fmtDate(getValue()) : '—'}</span> },
    { id: 'status', header: 'Status', accessorFn: r => r.status,
      cell: ({ getValue }) => (
        <Badge tone={getValue() === 'ACTIVE' ? 'green' : getValue() === 'GRADUATED' ? 'sky' : 'stone'} dot>
          {getValue()}
        </Badge>
      ) },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        count={`${students.length} enrolled`}
        subtitle={`AY 2026-27 ${isHO ? '· all units' : `· ${user?.unitName}`}`}
      />

      {/* ── Stat chips ── */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <span className="chip"><span className="chip-dot bg-emerald-500" /> Active <b className="text-ink">{active}</b></span>
        <span className="chip"><span className="chip-dot bg-honey-500" /> Sibling-linked <b className="text-ink">{siblings}</b></span>
        {isHO && byUnit.map(u => (
          <span key={u.code} className="chip">{u.code} <b className="text-ink">{u.n}</b></span>
        ))}
      </div>

      <DataTable
        title="Student Register"
        columns={columns}
        data={students}
        isLoading={isLoading}
        searchPlaceholder="Search name, admission no, parent…"
        exportName="students"
        filterable={[
          { id: 'programme', label: 'Programme' },
          { id: 'status', label: 'Status' },
          { id: 'plan', label: 'Fee Plan' },
          ...(isHO ? [{ id: 'unit', label: 'Unit' }] : []),
        ]}
        onRowClick={(r: StudentRow) => setDocsFor(r)}
      />

      {docsFor && <DocumentsDrawer student={docsFor} onClose={() => setDocsFor(null)} />}
    </div>
  );
}

import { ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  UserPlus, X, KeyRound, ShieldCheck, Building2, Clock3, Lock, Plus,
} from 'lucide-react';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { api, fmtDate } from '../lib/api';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { cn } from '../lib/utils';

const ADMIN_ROLES = ['FOUNDER', 'ACADEMIC_DIR'];
const CH_ROLES = ['COORDINATOR', 'TEACHER', 'RECEPTIONIST'];
const ROLE_TONES: Record<string, any> = {
  FOUNDER: 'honey', ACADEMIC_DIR: 'violet', CURRICULUM_LEAD: 'violet',
  CENTRE_HEAD: 'sky', COORDINATOR: 'green', TEACHER: 'pink', RECEPTIONIST: 'stone',
};

// ───────────────────────── shared modal ─────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg font-extrabold">{title}</h3>
          <button className="btn-neo-icon p-1.5" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-stone-600">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-stone-500">{hint}</p>}
    </div>
  );
}

// ───────────────────────── Team tab ─────────────────────────
function TeamTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = ADMIN_ROLES.includes(user!.role);
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api('/users') });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({});
  const [err, setErr] = useState('');

  const roleOptions = isAdmin
    ? ['ACADEMIC_DIR', 'CURRICULUM_LEAD', 'CENTRE_HEAD', 'COORDINATOR', 'TEACHER', 'RECEPTIONIST']
    : CH_ROLES;

  const save = useMutation({
    mutationFn: async () => {
      setErr('');
      if (adding) return api('/users', { method: 'POST', body: JSON.stringify(form) });
      const { id, newPassword, ...rest } = form;
      const r = await api(`/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(rest) });
      if (newPassword) await api(`/users/${editing.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
      return r;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setAdding(false); setEditing(null); },
    onError: (e: any) => setErr(e.message),
  });

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'member', header: 'Member', accessorFn: r => r.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-honey-100 font-heading text-xs font-extrabold text-honey-700 shadow-neo-xs">
            {row.original.fullName.split(' ').filter((w: string) => /^[A-Za-z]/.test(w)).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div className="font-bold">{row.original.fullName}</div>
            <div className="text-xs text-stone-500">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'role', header: 'Role', accessorFn: r => ROLE_LABELS[r.role] ?? r.role,
      cell: ({ row }) => <Badge tone={ROLE_TONES[row.original.role]} dot>{ROLE_LABELS[row.original.role] ?? row.original.role}</Badge>,
    },
    { id: 'unit', header: 'Unit', accessorFn: r => r.unit ? `${r.unit.code} · ${r.unit.name}` : 'Head Office' },
    { id: 'phone', header: 'Phone', accessorFn: r => r.phone ?? '—' },
    {
      id: 'status', header: 'Status', accessorFn: r => (r.isActive ? 'Active' : 'Disabled'),
      cell: ({ row }) => <Badge tone={row.original.isActive ? 'green' : 'red'} dot>{row.original.isActive ? 'Active' : 'Disabled'}</Badge>,
    },
    { id: 'last', header: 'Last login', accessorFn: r => r.lastLoginAt ? fmtDate(r.lastLoginAt) : 'Never' },
  ], []);

  const unitSelect = (
    <select className="input" value={form.unitId ?? ''} onChange={e => setForm({ ...form, unitId: e.target.value || null })}>
      <option value="">Head Office (no unit)</option>
      {units?.map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
    </select>
  );

  return (
    <>
      <DataTable
        columns={columns} data={users ?? []} isLoading={isLoading}
        title="Team Members" searchPlaceholder="Search team…" exportName="team"
        filterable={[{ id: 'role', label: 'Role' }, { id: 'unit', label: 'Unit' }, { id: 'status', label: 'Status' }]}
        onRowClick={row => {
          setErr('');
          setEditing(row); setForm({
            fullName: row.fullName, phone: row.phone ?? '', role: row.role,
            unitId: row.unitId, isActive: row.isActive, newPassword: '',
          });
        }}
      />
      <div className="mt-4">
        <button className="btn-primary" onClick={() => { setErr(''); setAdding(true); setForm({ role: isAdmin ? 'CENTRE_HEAD' : 'TEACHER', unitId: user!.unitId ?? '' }); }}>
          <UserPlus className="h-4 w-4" /> Add team member
        </button>
      </div>

      {(adding || editing) && (
        <Modal title={adding ? 'Add team member' : `Edit — ${editing.fullName}`} onClose={() => { setAdding(false); setEditing(null); }}>
          <div className="space-y-3.5">
            <Field label="Full name"><input className="input" value={form.fullName ?? ''} onChange={e => setForm({ ...form, fullName: e.target.value })} /></Field>
            {adding && <Field label="Email (login id — one login per person)"><input className="input" type="email" value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>}
            <Field label="Phone"><input className="input" value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {(editing && !roleOptions.includes(editing.role) ? [editing.role, ...roleOptions] : roleOptions).map(r =>
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
              </Field>
              <Field label="Unit">{unitSelect}</Field>
            </div>
            {adding
              ? <Field label="Temporary password" hint="Minimum 8 characters — share privately; they can change it in Settings → My Account."><input className="input" type="text" value={form.password ?? ''} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
              : <>
                  <Field label="Reset password (optional)" hint="Leave blank to keep the current password."><input className="input" type="text" placeholder="New password…" value={form.newPassword ?? ''} onChange={e => setForm({ ...form, newPassword: e.target.value })} /></Field>
                  <label className="flex items-center gap-2.5 text-sm font-semibold text-stone-700">
                    <input type="checkbox" className="h-4 w-4 accent-honey-500" checked={!!form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                    Account active
                  </label>
                </>}
            {err && <p className="rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-neo" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ───────────────────────── Batches tab ─────────────────────────
function BatchesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = ADMIN_ROLES.includes(user!.role);
  const { data: batches, isLoading } = useQuery({ queryKey: ['batches'], queryFn: () => api('/batches') });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const { data: programmes } = useQuery({ queryKey: ['programmes'], queryFn: () => api('/programmes') });
  const [modal, setModal] = useState<null | { mode: 'add' } | { mode: 'edit'; batch: any }>(null);
  const [form, setForm] = useState<any>({});
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => modal?.mode === 'add'
      ? api('/batches', { method: 'POST', body: JSON.stringify(form) })
      : api(`/batches/${(modal as any).batch.id}`, { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['batches'] }); setModal(null); },
    onError: (e: any) => setErr(e.message),
  });

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { id: 'name', header: 'Batch', accessorFn: r => r.name, cell: ({ row }) => <span className="font-bold">{row.original.name}</span> },
    { id: 'unit', header: 'Unit', accessorFn: r => r.unit?.code ?? '' },
    {
      id: 'programme', header: 'Programme', accessorFn: r => r.programme?.name ?? '',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shadow-neo-xs" style={{ background: row.original.programme?.levelColour }} />
          {row.original.programme?.name}
        </span>
      ),
    },
    { id: 'shift', header: 'Shift', accessorFn: r => r.shift, cell: ({ row }) => <Badge tone={row.original.shift === 'evening' ? 'violet' : 'sky'}>{row.original.shift}</Badge> },
    {
      id: 'timing', header: 'Timing', accessorFn: r => r.startTime,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-stone-700">
          <Clock3 className="h-3.5 w-3.5 text-honey-600" />
          {row.original.startTime}{row.original.endTime ? ` – ${row.original.endTime}` : ''}
        </span>
      ),
    },
    { id: 'seats', header: 'Seats', accessorFn: r => `${r._count?.students ?? 0} / ${r.capacity}` },
    { id: 'ay', header: 'AY', accessorFn: r => r.academicYear },
    {
      id: 'status', header: 'Status', accessorFn: r => (r.isActive ? 'Active' : 'Inactive'),
      cell: ({ row }) => <Badge tone={row.original.isActive ? 'green' : 'stone'} dot>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ], []);

  const open = (mode: 'add' | 'edit', batch?: any) => {
    setErr('');
    if (mode === 'add') { setForm({ unitId: user!.unitId ?? units?.[0]?.id ?? '', programmeId: programmes?.[0]?.id ?? '', shift: 'morning', academicYear: '2026-27', capacity: 20, startTime: '08:00' }); setModal({ mode: 'add' }); }
    else { setForm({ name: batch.name, medium: batch.medium ?? '', shift: batch.shift, startTime: batch.startTime, endTime: batch.endTime ?? '', capacity: batch.capacity, academicYear: batch.academicYear, isActive: batch.isActive, programmeId: batch.programmeId }); setModal({ mode: 'edit', batch }); }
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-sky-100/60 px-3.5 py-2.5 text-xs font-semibold text-sky-700">
        <Clock3 className="h-4 w-4 shrink-0" />
        Batch start times drive the attendance lock (start + 30 min) and absence messages — keep them accurate.
      </div>
      <DataTable
        columns={columns} data={batches ?? []} isLoading={isLoading}
        title="Batch Masters" searchPlaceholder="Search batches…" exportName="batches"
        filterable={[{ id: 'unit', label: 'Unit' }, { id: 'programme', label: 'Programme' }, { id: 'shift', label: 'Shift' }, { id: 'status', label: 'Status' }]}
        onRowClick={row => open('edit', row)}
      />
      <div className="mt-4">
        <button className="btn-primary" onClick={() => open('add')}><Plus className="h-4 w-4" /> New batch</button>
      </div>

      {modal && (
        <Modal title={modal.mode === 'add' ? 'New batch' : `Edit — ${(modal as any).batch.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3.5">
            <Field label="Batch name"><input className="input" placeholder="e.g. K1 Morning Gujarati" value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              {modal.mode === 'add' && (
                <Field label="Unit">
                  <select className="input" value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })} disabled={!isAdmin}>
                    {units?.filter((u: any) => isAdmin || u.id === user!.unitId).map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Programme">
                <select className="input" value={form.programmeId} onChange={e => setForm({ ...form, programmeId: e.target.value })}>
                  {programmes?.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.tierName})</option>)}
                </select>
              </Field>
              <Field label="Shift">
                <select className="input" value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })}>
                  <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
                </select>
              </Field>
              <Field label="Medium">
                <select className="input" value={form.medium ?? ''} onChange={e => setForm({ ...form, medium: e.target.value })}>
                  <option value="">—</option><option value="gujarati">Gujarati</option><option value="english">English</option>
                </select>
              </Field>
              <Field label="Start time (drives attendance lock)"><input className="input" type="time" value={form.startTime ?? ''} onChange={e => setForm({ ...form, startTime: e.target.value })} /></Field>
              <Field label="End time"><input className="input" type="time" value={form.endTime ?? ''} onChange={e => setForm({ ...form, endTime: e.target.value })} /></Field>
              <Field label="Capacity"><input className="input" type="number" min={1} value={form.capacity ?? ''} onChange={e => setForm({ ...form, capacity: e.target.value })} /></Field>
              <Field label="Academic year"><input className="input" value={form.academicYear ?? ''} onChange={e => setForm({ ...form, academicYear: e.target.value })} /></Field>
            </div>
            {modal.mode === 'edit' && (
              <label className="flex items-center gap-2.5 text-sm font-semibold text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-honey-500" checked={!!form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Batch active
              </label>
            )}
            {err && <p className="rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-neo" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ───────────────────────── Units tab (HO) ─────────────────────────
function UnitsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isFounder = user!.role === 'FOUNDER';
  const { data: units, isLoading } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const { name, address, phone, email, status, pettyCashFloat, admissionNumber, calendlyLink } = form;
      await api(`/units/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name, address, phone, email, status }) });
      const settings: any = { admissionNumber, calendlyLink };
      if (isFounder) settings.pettyCashFloat = pettyCashFloat;
      await api(`/units/${editing.id}/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['units'] }); setEditing(null); },
    onError: (e: any) => setErr(e.message),
  });

  if (isLoading) return <div className="card p-6 text-sm text-stone-600">Loading units…</div>;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {units?.map((u: any) => (
          <div key={u.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl shadow-neo-inset-sm p-2.5 text-honey-600"><Building2 className="h-5 w-5" /></div>
                <div>
                  <div className="font-heading font-extrabold">{u.code} · {u.name}</div>
                  <Badge tone={u.status === 'ACTIVE' ? 'green' : u.status === 'DEVELOPMENT' ? 'honey' : 'stone'} dot>{u.status}</Badge>
                </div>
              </div>
              <button className="btn-neo" onClick={() => {
                setErr('');
                setEditing(u);
                setForm({
                  name: u.name, address: u.address ?? '', phone: u.phone ?? '', email: u.email ?? '', status: u.status,
                  pettyCashFloat: u.settings?.pettyCashFloat ?? 5000, admissionNumber: u.settings?.admissionNumber ?? '', calendlyLink: u.settings?.calendlyLink ?? '',
                });
              }}>Edit</button>
            </div>
            <dl className="mt-4 space-y-2 border-t border-[#E6D7A8] pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-stone-500 font-semibold">Address</dt><dd className="text-right font-semibold text-stone-700 max-w-[60%]">{u.address ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500 font-semibold">Ops phone (internal)</dt><dd className="font-semibold text-stone-700">{u.phone ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500 font-semibold">Calendly</dt><dd className="font-semibold text-stone-700 truncate max-w-[60%]">{u.settings?.calendlyLink ?? '—'}</dd></div>
              <div className="flex justify-between items-center">
                <dt className="flex items-center gap-1 text-stone-500 font-semibold"><Lock className="h-3 w-3" /> Petty cash float</dt>
                <dd className="font-bold text-honey-700">₹{Number(u.settings?.pettyCashFloat ?? 5000).toLocaleString('en-IN')}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-stone-500">Only the central hub number is ever published — unit ops numbers stay internal (spec rule).</p>

      {editing && (
        <Modal title={`${editing.code} — Unit settings`} onClose={() => setEditing(null)}>
          <div className="space-y-3.5">
            <Field label="Unit name"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Address"><input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ops phone (internal only)"><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Email"><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">Active</option><option value="DEVELOPMENT">Development</option><option value="INACTIVE">Inactive</option>
                </select>
              </Field>
              <Field label={isFounder ? 'Petty cash float (₹)' : 'Petty cash float (Founder-locked)'}>
                <input className="input" type="number" disabled={!isFounder} value={form.pettyCashFloat} onChange={e => setForm({ ...form, pettyCashFloat: e.target.value })} />
              </Field>
            </div>
            <Field label="Calendly link (Discovery Flight bookings)"><input className="input" placeholder="https://calendly.com/…" value={form.calendlyLink} onChange={e => setForm({ ...form, calendlyLink: e.target.value })} /></Field>
            {err && <p className="rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-neo" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ───────────────────────── Programmes tab (HO-locked, read-only) ─────────────────────────
function ProgrammesTab() {
  const { data: programmes, isLoading } = useQuery({ queryKey: ['programmes'], queryFn: () => api('/programmes') });
  if (isLoading) return <div className="card p-6 text-sm text-stone-600">Loading…</div>;
  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-honey-100/60 px-3.5 py-2.5 text-xs font-semibold text-honey-700">
        <Lock className="h-4 w-4 shrink-0" />
        Programme ladder is fixed by spec (Todd Care → K2, Baby Bees → Brilliant Bees) and HO-locked. Names and tiers are never modified.
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {programmes?.map((p: any) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 rounded-xl shadow-neo-xs" style={{ background: p.levelColour }} />
              <div>
                <div className="font-heading font-extrabold">{p.name}</div>
                <div className="text-xs font-semibold text-honey-700">{p.tierName}</div>
              </div>
            </div>
            <div className="mt-3 border-t border-[#E6D7A8] pt-3 text-xs font-semibold text-stone-600">
              Age {Number(p.ageMin)} – {Number(p.ageMax)} years
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Areas tab (routing lookup, HO-maintained) ─────────────────────────
function AreasTab() {
  const qc = useQueryClient();
  const { data: areas, isLoading } = useQuery({ queryKey: ['areas'], queryFn: () => api('/areas') });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const [modal, setModal] = useState<null | { mode: 'add' } | { mode: 'edit'; area: any }>(null);
  const [form, setForm] = useState<any>({});
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: () => modal?.mode === 'add'
      ? api('/areas', { method: 'POST', body: JSON.stringify(form) })
      : api(`/areas/${(modal as any).area.id}`, { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['areas'] }); setModal(null); },
    onError: (e: any) => setErr(e.message),
  });
  const columns = useMemo<ColumnDef<any>[]>(() => [
    { id: 'locality', header: 'Locality', accessorFn: r => r.locality, cell: ({ row }) => <span className="font-bold">{row.original.locality}</span> },
    { id: 'pincode', header: 'Pincode', accessorFn: r => r.pincode ?? '—' },
    { id: 'unit', header: 'Routes to', accessorFn: r => r.suggestedUnit.code, cell: ({ row }) => <Badge tone="honey">→ {row.original.suggestedUnit.code} · {row.original.suggestedUnit.name}</Badge> },
    { id: 'status', header: 'Status', accessorFn: r => (r.isActive ? 'Active' : 'Disabled'), cell: ({ row }) => <Badge tone={row.original.isActive ? 'green' : 'red'} dot>{row.original.isActive ? 'Active' : 'Disabled'}</Badge> },
  ], []);
  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-honey-100/60 px-3.5 py-2.5 text-xs font-semibold text-honey-700">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        The area master drives First Buzz routing: locality → suggested unit. Routing away from the suggestion requires a mandatory note.
      </div>
      <DataTable
        columns={columns} data={areas ?? []} isLoading={isLoading}
        title="Area Master" searchPlaceholder="Search localities…" exportName="areas"
        filterable={[{ id: 'unit', label: 'Routes to' }, { id: 'status', label: 'Status' }]}
        onRowClick={row => { setErr(''); setForm({ locality: row.locality, pincode: row.pincode ?? '', suggestedUnitId: row.suggestedUnitId, isActive: row.isActive }); setModal({ mode: 'edit', area: row }); }}
      />
      <div className="mt-4">
        <button className="btn-primary" onClick={() => { setErr(''); setForm({ suggestedUnitId: units?.[0]?.id ?? '' }); setModal({ mode: 'add' }); }}><Plus className="h-4 w-4" /> Add locality</button>
      </div>
      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add locality' : `Edit — ${(modal as any).area.locality}`} onClose={() => setModal(null)}>
          <div className="space-y-3.5">
            <Field label="Locality"><input className="input" value={form.locality ?? ''} onChange={e => setForm({ ...form, locality: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pincode"><input className="input" value={form.pincode ?? ''} onChange={e => setForm({ ...form, pincode: e.target.value })} /></Field>
              <Field label="Routes to unit">
                <select className="input" value={form.suggestedUnitId} onChange={e => setForm({ ...form, suggestedUnitId: e.target.value })}>
                  {units?.map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                </select>
              </Field>
            </div>
            {modal.mode === 'edit' && (
              <label className="flex items-center gap-2.5 text-sm font-semibold text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-honey-500" checked={!!form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
            )}
            {err && <p className="rounded-xl bg-rose-100/70 px-3 py-2 text-xs font-semibold text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-neo" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ───────────────────────── Audit tab ─────────────────────────
function AuditTab() {
  const { data: logs, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => api('/audit') });
  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'when', header: 'When', accessorFn: r => r.changedAt,
      cell: ({ row }) => <span className="text-stone-700">{new Date(row.original.changedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>,
    },
    {
      id: 'who', header: 'Who', accessorFn: r => r.changedBy?.fullName ?? 'System',
      cell: ({ row }) => (
        <div>
          <div className="font-bold">{row.original.changedBy?.fullName ?? 'System'}</div>
          <div className="text-[11px] text-stone-500">{ROLE_LABELS[row.original.changedBy?.role] ?? ''}</div>
        </div>
      ),
    },
    {
      id: 'action', header: 'Action', accessorFn: r => r.action,
      cell: ({ row }) => <Badge tone={row.original.action === 'INSERT' ? 'green' : row.original.action === 'DELETE' ? 'red' : 'honey'} dot>{row.original.action}</Badge>,
    },
    { id: 'table', header: 'Table', accessorFn: r => r.tableName },
    { id: 'record', header: 'Record', accessorFn: r => r.recordId, cell: ({ row }) => <span className="font-mono text-[11px] text-stone-500">{row.original.recordId.slice(0, 8)}…</span> },
    { id: 'ip', header: 'IP', accessorFn: r => r.ipAddress ?? '—' },
  ], []);
  return (
    <DataTable
      columns={columns} data={logs ?? []} isLoading={isLoading}
      title="Audit Trail" searchPlaceholder="Search audit…" exportName="audit"
      filterable={[{ id: 'action', label: 'Action' }, { id: 'table', label: 'Table' }, { id: 'who', label: 'Who' }]}
    />
  );
}

// ───────────────────────── My Account tab ─────────────────────────
function AccountTab() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = useMutation({
    mutationFn: () => {
      if (form.newPassword !== form.confirm) throw new Error('New passwords do not match');
      return api('/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
    },
    onSuccess: () => { setMsg({ ok: true, text: 'Password changed successfully.' }); setForm({ currentPassword: '', newPassword: '', confirm: '' }); },
    onError: (e: any) => setMsg({ ok: false, text: e.message }),
  });
  return (
    <div className="max-w-md">
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl shadow-neo-inset-sm p-2.5 text-honey-600"><KeyRound className="h-5 w-5" /></div>
          <div>
            <div className="font-heading font-extrabold">Change password</div>
            <div className="text-xs text-stone-500">{user!.email}</div>
          </div>
        </div>
        <div className="space-y-3.5">
          <Field label="Current password"><input className="input" type="password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="Minimum 8 characters."><input className="input" type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} /></Field>
          <Field label="Confirm new password"><input className="input" type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></Field>
          {msg && <p className={cn('rounded-xl px-3 py-2 text-xs font-semibold', msg.ok ? 'bg-emerald-100/70 text-emerald-700' : 'bg-rose-100/70 text-rose-600')}>{msg.text}</p>}
          <button className="btn-primary w-full" disabled={change.isPending} onClick={() => { setMsg(null); change.mutate(); }}>
            {change.isPending ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user!.role);
  const isCH = user!.role === 'CENTRE_HEAD';

  const tabs = [
    ...(isAdmin || isCH ? [{ id: 'team', label: 'Team' }, { id: 'batches', label: 'Batches' }] : []),
    ...(isAdmin ? [{ id: 'units', label: 'Units' }, { id: 'areas', label: 'Areas' }, { id: 'programmes', label: 'Programmes' }, { id: 'audit', label: 'Audit Log' }] : []),
    { id: 'account', label: 'My Account' },
  ];
  const [tab, setTab] = useState(tabs[0].id);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Team, batch masters, unit settings & audit trail — every change is logged"
        action={<span className="chip"><ShieldCheck className="h-3.5 w-3.5 text-honey-600" /> {ROLE_LABELS[user!.role]}</span>}
      />
      <div className="seg mb-5 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} className={cn('seg-item', tab === t.id && 'seg-item-active')} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'team' && <TeamTab />}
      {tab === 'batches' && <BatchesTab />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'areas' && <AreasTab />}
      {tab === 'programmes' && <ProgrammesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'account' && <AccountTab />}
    </div>
  );
}

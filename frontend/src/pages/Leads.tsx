import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  List, LayoutGrid, Plus, ArrowRight, MapPin, Route, StickyNote,
  GraduationCap, XCircle, Sparkles,
} from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';
import { cn } from '../lib/utils';

interface LeadRow {
  id: string; inquiryNo: string; stage: string; parentName: string; parentPhone: string;
  childName: string | null; areaLocality: string | null; preferredUnit: string | null;
  inquiryChannel: string; leadScore: number; createdAt: string;
  programmeInterest: { id?: string; name: string; levelColour: string } | null;
  assignedUnit: { code: string } | null;
  suggestedUnit: { code: string } | null;
}

export const STAGE_META: Record<string, { label: string; tone: any; colour: string }> = {
  NEW_INQUIRY: { label: 'New Inquiry', tone: 'sky', colour: '#4BAED0' },
  FIRST_BUZZ: { label: 'First Buzz', tone: 'honey', colour: '#C8922A' },
  ROUTING: { label: 'Routing', tone: 'violet', colour: '#8B5CF6' },
  EXPERIENCE_SESSION: { label: 'Experience', tone: 'pink', colour: '#EC4899' },
  DISCOVERY_FLIGHT: { label: 'Discovery Flight', tone: 'honey', colour: '#D6A747' },
  OFFER: { label: 'Offer', tone: 'violet', colour: '#7C3AED' },
  CONFIRMATION: { label: 'Confirmation', tone: 'green', colour: '#10B981' },
  ENROLLED: { label: 'Enrolled', tone: 'green', colour: '#059669' },
  LOST: { label: 'Lost', tone: 'stone', colour: '#9CA3AF' },
};
const STAGE_ORDER = ['NEW_INQUIRY', 'FIRST_BUZZ', 'ROUTING', 'EXPERIENCE_SESSION', 'DISCOVERY_FLIGHT', 'OFFER', 'CONFIRMATION', 'ENROLLED'];
const CHANNEL_ICON: Record<string, string> = {
  CALL: '📞', WHATSAPP: '💬', WEBSITE: '🌐', SOCIAL: '📣', EVENT: '🎪', REFERRAL: '🤝', WALK_IN: '🚶',
};

// ───────────────────────── Add Lead (First Buzz Forms A & B) ─────────────────────────
function AddLeadModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isHO = HO_ROLES.includes(user!.role);
  const { data: programmes } = useQuery({ queryKey: ['programmes'], queryFn: () => api('/programmes') });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const { data: areas } = useQuery({ queryKey: ['areas'], queryFn: () => api('/areas') });
  const [ver, setVer] = useState<'A' | 'B'>('A');
  const [form, setForm] = useState<any>({ inquiryChannel: 'CALL', preferredUnit: 'NO_PREFERENCE' });
  const [err, setErr] = useState('');
  const [created, setCreated] = useState<any>(null);

  const save = useMutation({
    mutationFn: () => api('/leads', { method: 'POST', body: JSON.stringify({ ...form, formVersion: ver }) }),
    onSuccess: (lead) => { qc.invalidateQueries({ queryKey: ['leads'] }); setCreated(lead); },
    onError: (e: any) => setErr(e.message),
  });

  if (created) {
    return (
      <Modal title="Inquiry created 🐝" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-100/70 px-4 py-3 text-sm font-bold text-emerald-700">{created.inquiryNo}</div>
          <div className="neo-inset p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Routing basis</span><span className="font-bold">{created.routingBasis}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Suggested unit</span><span className="font-bold text-honey-700">{created.suggestedUnit?.code ?? 'None — route manually'}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Lead score</span><span className="font-bold">{created.leadScore}</span></div>
          </div>
          <p className="text-[11px] text-stone-500">Open the lead to confirm routing — receptionist confirms, overrides need a note.</p>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New inquiry — First Buzz" onClose={onClose} wide>
      <div className="seg mb-4">
        <button className={cn('seg-item', ver === 'A' && 'seg-item-active')} onClick={() => setVer('A')}>Form A · Hub / Remote</button>
        <button className={cn('seg-item', ver === 'B' && 'seg-item-active')} onClick={() => setVer('B')}>Form B · Walk-in</button>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Parent name *"><input className="input" value={form.parentName ?? ''} onChange={e => setForm({ ...form, parentName: e.target.value })} /></Field>
        <Field label="Parent phone *"><input className="input" value={form.parentPhone ?? ''} onChange={e => setForm({ ...form, parentPhone: e.target.value })} /></Field>
        <Field label="Child name"><input className="input" value={form.childName ?? ''} onChange={e => setForm({ ...form, childName: e.target.value })} /></Field>
        <Field label="Child date of birth"><input className="input" type="date" value={form.childDob ?? ''} onChange={e => setForm({ ...form, childDob: e.target.value })} /></Field>
        <Field label="Programme interest">
          <select className="input" value={form.programmeInterestId ?? ''} onChange={e => setForm({ ...form, programmeInterestId: e.target.value })}>
            <option value="">—</option>
            {programmes?.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.tierName})</option>)}
          </select>
        </Field>
        {ver === 'A' ? (
          <>
            <Field label="Inquiry channel">
              <select className="input" value={form.inquiryChannel} onChange={e => setForm({ ...form, inquiryChannel: e.target.value })}>
                {['CALL', 'WHATSAPP', 'WEBSITE', 'SOCIAL', 'EVENT', 'REFERRAL'].map(c => <option key={c} value={c}>{c.toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Area / locality (drives routing)">
              <input className="input" list="bb-areas" placeholder="e.g. Kalawad Road" value={form.areaLocality ?? ''} onChange={e => setForm({ ...form, areaLocality: e.target.value })} />
              <datalist id="bb-areas">{areas?.map((a: any) => <option key={a.id} value={a.locality} />)}</datalist>
            </Field>
            <Field label="Parent's preferred unit">
              <select className="input" value={form.preferredUnit} onChange={e => setForm({ ...form, preferredUnit: e.target.value })}>
                <option value="NO_PREFERENCE">No preference</option>
                {units?.map((u: any) => <option key={u.id} value={u.code}>{u.code} · {u.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Walked into unit *">
            <select className="input" value={form.walkInUnitId ?? (isHO ? '' : user!.unitId ?? '')} onChange={e => setForm({ ...form, walkInUnitId: e.target.value })} disabled={!isHO}>
              {isHO && <option value="">— pick unit —</option>}
              {units?.filter((u: any) => isHO || u.id === user!.unitId).map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Source campaign"><input className="input" placeholder="e.g. Navratri stall" value={form.sourceCampaign ?? ''} onChange={e => setForm({ ...form, sourceCampaign: e.target.value })} /></Field>
      </div>
      <label className="mt-3.5 flex items-center gap-2.5 text-sm font-semibold text-stone-700">
        <input type="checkbox" className="h-4 w-4 accent-honey-500" checked={!!form.experienceInterest} onChange={e => setForm({ ...form, experienceInterest: e.target.checked })} />
        Interested in an Experience Session
      </label>
      <div className="mt-3.5"><Field label="Notes"><textarea className="input" rows={2} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
      <div className="mt-3.5 space-y-3">
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button className="btn-neo" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => { setErr(''); save.mutate(); }}>
            {save.isPending ? 'Creating…' : 'Create inquiry'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Register (Stage-2) modal ─────────────────────────
function RegisterModal({ lead, onClose }: { lead: any; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: programmes } = useQuery({ queryKey: ['programmes'], queryFn: () => api('/programmes') });
  const [first = '', ...rest] = (lead.childName ?? '').split(' ');
  const [form, setForm] = useState<any>({
    firstName: first, lastName: rest.join(' '), dob: lead.childDob?.slice(0, 10) ?? '',
    fatherName: lead.parentName, fatherPhone: lead.parentPhone,
    programmeId: lead.programmeInterest?.id ?? '',
  });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const save = useMutation({
    mutationFn: () => api(`/leads/${lead.id}/register`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: (r) => { qc.invalidateQueries(); setDone(r); },
    onError: (e: any) => setErr(e.message),
  });

  if (done) {
    return (
      <Modal title="Registration complete" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-100/70 px-4 py-3 text-sm font-bold text-emerald-700">{done.admissionNo}</div>
          {done.siblingDetected && (
            <div className="flex items-center gap-2 rounded-xl bg-honey-100/70 px-3.5 py-2.5 text-xs font-bold text-honey-700">
              <Sparkles className="h-4 w-4 shrink-0" /> Sibling detected — {done.siblingOf}. HO-rate sibling concession will auto-apply on the fee ledger.
            </div>
          )}
          <div className="neo-inset p-3.5 text-xs flex justify-between">
            <span className="font-semibold text-stone-500">Suggested instalment plan (by joining window)</span>
            <span className="font-bold">{String(done.instalmentPlan).replace('PLAN_', 'Plan ')}</span>
          </div>
          <button className="btn-primary w-full" onClick={() => { onClose(); navigate('/admissions'); }}>
            Continue in Admissions <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Stage-2 Registration — ${lead.inquiryNo}`} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Child first name *"><input className="input" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Child last name *"><input className="input" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Date of birth *"><input className="input" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /></Field>
        <Field label="Gender">
          <select className="input" value={form.gender ?? ''} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </Field>
        <Field label="Programme *">
          <select className="input" value={form.programmeId} onChange={e => setForm({ ...form, programmeId: e.target.value })}>
            <option value="">—</option>
            {programmes?.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.tierName})</option>)}
          </select>
        </Field>
        <Field label="Address / area"><input className="input" value={form.addressArea ?? lead.areaLocality ?? ''} onChange={e => setForm({ ...form, addressArea: e.target.value })} /></Field>
        <Field label="Father name"><input className="input" value={form.fatherName ?? ''} onChange={e => setForm({ ...form, fatherName: e.target.value })} /></Field>
        <Field label="Father phone (sibling detection)"><input className="input" value={form.fatherPhone ?? ''} onChange={e => setForm({ ...form, fatherPhone: e.target.value })} /></Field>
        <Field label="Mother name"><input className="input" value={form.motherName ?? ''} onChange={e => setForm({ ...form, motherName: e.target.value })} /></Field>
        <Field label="Mother phone"><input className="input" value={form.motherPhone ?? ''} onChange={e => setForm({ ...form, motherPhone: e.target.value })} /></Field>
        <Field label="Blood group (staff-only)"><input className="input" value={form.bloodGroup ?? ''} onChange={e => setForm({ ...form, bloodGroup: e.target.value })} /></Field>
        <Field label="Allergies (staff-only)"><input className="input" value={form.allergies ?? ''} onChange={e => setForm({ ...form, allergies: e.target.value })} /></Field>
      </div>
      <div className="mt-3.5 space-y-3">
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button className="btn-neo" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => { setErr(''); save.mutate(); }}>{save.isPending ? 'Registering…' : 'Register child'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Lead detail drawer ─────────────────────────
function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: lead } = useQuery({ queryKey: ['lead', leadId], queryFn: () => api(`/leads/${leadId}`) });
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const [routeUnit, setRouteUnit] = useState('');
  const [routeNote, setRouteNote] = useState('');
  const [noteText, setNoteText] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => { qc.invalidateQueries({ queryKey: ['lead', leadId] }); qc.invalidateQueries({ queryKey: ['leads'] }); };
  const doRoute = useMutation({
    mutationFn: () => api(`/leads/${leadId}/route`, { method: 'POST', body: JSON.stringify({ unitId: routeUnit, note: routeNote || undefined }) }),
    onSuccess: () => { setRouteNote(''); setErr(''); refresh(); }, onError: (e: any) => setErr(e.message),
  });
  const doStage = useMutation({
    mutationFn: (p: { stage: string; note?: string }) => api(`/leads/${leadId}/stage`, { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => { setShowLost(false); setLostNote(''); setErr(''); refresh(); }, onError: (e: any) => setErr(e.message),
  });
  const doNote = useMutation({
    mutationFn: () => api(`/leads/${leadId}/activities`, { method: 'POST', body: JSON.stringify({ note: noteText }) }),
    onSuccess: () => { setNoteText(''); refresh(); }, onError: (e: any) => setErr(e.message),
  });

  if (!lead) return null;
  const m = STAGE_META[lead.stage] ?? { label: lead.stage, tone: 'stone' };
  const idx = STAGE_ORDER.indexOf(lead.stage);
  const next = idx >= 0 && idx < STAGE_ORDER.indexOf('CONFIRMATION') ? STAGE_ORDER[idx + 1] : null;
  const canAct = ['FOUNDER', 'ACADEMIC_DIR', 'RECEPTIONIST', 'CENTRE_HEAD'].includes(user!.role);
  const isOverride = routeUnit && lead.suggestedUnitId && routeUnit !== lead.suggestedUnitId;
  const isReroute = routeUnit && lead.assignedUnitId && routeUnit !== lead.assignedUnitId;

  return (
    <>
      <div className="fixed inset-0 z-40">
        <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" onClick={onClose} />
        <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-cream p-5 shadow-lift">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="font-heading text-lg font-extrabold">{lead.parentName}</div>
              <div className="text-xs text-stone-500">{lead.inquiryNo} · {CHANNEL_ICON[lead.inquiryChannel]} {lead.inquiryChannel.toLowerCase()}</div>
            </div>
            <button className="btn-neo-icon p-1.5" onClick={onClose}><XCircle className="h-4 w-4" /></button>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Badge tone={m.tone} dot>{m.label}</Badge>
            <span className="chip">Score {lead.leadScore}</span>
            {lead.student && <Badge tone="green">{lead.student.admissionNo}</Badge>}
          </div>

          {/* Child / contact */}
          <div className="card mt-4 p-4 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Child</span><span className="font-bold">{lead.childName ?? '—'}{lead.childDob ? ` · ${fmtDate(lead.childDob)}` : ''}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Phone</span><span className="font-bold">{lead.parentPhone}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Programme</span><span className="font-bold">{lead.programmeInterest?.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="font-semibold text-stone-500">Area</span><span className="font-bold">{lead.areaLocality ?? '—'}</span></div>
          </div>

          {/* Routing */}
          {canAct && lead.stage !== 'ENROLLED' && lead.stage !== 'LOST' && (
            <div className="card mt-3 p-4">
              <div className="mb-2 flex items-center gap-2 font-heading text-sm font-extrabold"><Route className="h-4 w-4 text-honey-600" /> Routing</div>
              <div className="text-xs space-y-1 mb-3">
                <div className="flex justify-between"><span className="font-semibold text-stone-500">Suggested (area master)</span><span className="font-bold text-honey-700">{lead.suggestedUnit?.code ?? 'none'}</span></div>
                <div className="flex justify-between"><span className="font-semibold text-stone-500">Assigned</span><span className="font-bold">{lead.assignedUnit?.code ?? 'unrouted'}</span></div>
              </div>
              <div className="flex gap-2">
                <select className="input" value={routeUnit} onChange={e => setRouteUnit(e.target.value)}>
                  <option value="">— route to —</option>
                  {units?.map((u: any) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
                </select>
              </div>
              {(isOverride || isReroute) && (
                <input className="input mt-2" placeholder={isReroute ? 'Re-route note (mandatory)' : 'Override note (mandatory)'} value={routeNote} onChange={e => setRouteNote(e.target.value)} />
              )}
              <button className="btn-primary mt-2 w-full" disabled={!routeUnit || doRoute.isPending} onClick={() => doRoute.mutate()}>
                {isReroute ? 'Re-route' : isOverride ? 'Override & assign' : 'Confirm routing'}
              </button>
            </div>
          )}

          {/* Stage actions */}
          {canAct && lead.stage !== 'ENROLLED' && lead.stage !== 'LOST' && (
            <div className="card mt-3 p-4 space-y-2">
              <div className="font-heading text-sm font-extrabold">Pipeline actions</div>
              {next && (
                <button className="btn-neo w-full justify-between" onClick={() => doStage.mutate({ stage: next })}>
                  Advance to {STAGE_META[next].label} <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {lead.assignedUnit && !lead.student && (
                <button className="btn-primary w-full" onClick={() => setShowRegister(true)}>
                  <GraduationCap className="h-4 w-4" /> Start Stage-2 Registration
                </button>
              )}
              {!showLost
                ? <button className="btn-neo w-full text-rose-500" onClick={() => setShowLost(true)}>Mark as Lost…</button>
                : (
                  <div className="space-y-2">
                    <input className="input" placeholder="Reason (mandatory)" value={lostNote} onChange={e => setLostNote(e.target.value)} />
                    <button className="btn-neo w-full text-rose-600" disabled={!lostNote.trim()} onClick={() => doStage.mutate({ stage: 'LOST', note: lostNote })}>Confirm Lost</button>
                  </div>
                )}
            </div>
          )}
          <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>

          {/* Timeline */}
          <div className="card mt-3 p-4">
            <div className="mb-3 flex items-center gap-2 font-heading text-sm font-extrabold"><StickyNote className="h-4 w-4 text-honey-600" /> Timeline</div>
            <div className="flex gap-2 mb-3">
              <input className="input" placeholder="Add a note…" value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && noteText.trim() && doNote.mutate()} />
              <button className="btn-neo-icon shrink-0" disabled={!noteText.trim()} onClick={() => doNote.mutate()}><Plus className="h-4 w-4" /></button>
            </div>
            <ol className="space-y-3">
              {lead.activities?.map((a: any) => (
                <li key={a.id} className="border-l-2 border-[#E6D7A8] pl-3">
                  <div className="text-[11px] font-bold text-stone-700">
                    {a.type === 'STAGE_CHANGE' && a.meta ? `${STAGE_META[a.meta.from]?.label ?? a.meta.from} → ${STAGE_META[a.meta.to]?.label ?? a.meta.to}`
                      : a.type === 'ROUTING' && a.meta ? `Routing ${a.meta.kind}: ${a.meta.from ?? '—'} → ${a.meta.to}`
                      : a.type.replace('_', ' ').toLowerCase()}
                  </div>
                  {a.note && <div className="text-xs text-stone-600">{a.note}</div>}
                  <div className="text-[10px] text-stone-500">{a.by?.fullName ?? 'System'} · {new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
      {showRegister && <RegisterModal lead={lead} onClose={() => setShowRegister(false)} />}
    </>
  );
}

// ───────────────────────── Page ─────────────────────────
export default function Leads() {
  const { data, isLoading } = useQuery({ queryKey: ['leads'], queryFn: () => api<LeadRow[]>('/leads') });
  const [view, setView] = useState<'list' | 'board'>('list');
  const [adding, setAdding] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const leads = data ?? [];
  const open = leads.filter(l => !['ENROLLED', 'LOST'].includes(l.stage)).length;
  const enrolled = leads.filter(l => l.stage === 'ENROLLED').length;
  const lost = leads.filter(l => l.stage === 'LOST').length;
  const conversion = leads.length ? Math.round((enrolled / leads.length) * 100) : 0;
  const unrouted = leads.filter(l => !l.assignedUnit).length;

  const columns = useMemo<ColumnDef<LeadRow, any>[]>(() => [
    {
      id: 'parent', header: 'Parent / Child',
      accessorFn: r => `${r.parentName} ${r.childName ?? ''} ${r.inquiryNo}`,
      cell: ({ row }) => (
        <div>
          <div className="font-bold text-[13px]">{row.original.parentName}</div>
          <div className="text-[11px] text-stone-500">
            {row.original.childName ? `Child: ${row.original.childName} · ` : ''}{row.original.inquiryNo}
          </div>
        </div>
      ),
    },
    {
      id: 'stage', header: 'Stage', accessorFn: r => STAGE_META[r.stage]?.label ?? r.stage,
      cell: ({ row }) => {
        const m = STAGE_META[row.original.stage] ?? { label: row.original.stage, tone: 'stone' };
        return <Badge tone={m.tone} dot>{m.label}</Badge>;
      },
    },
    {
      id: 'programme', header: 'Programme', accessorFn: r => r.programmeInterest?.name ?? '',
      cell: ({ row }) => row.original.programmeInterest ? (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: row.original.programmeInterest.levelColour }} />
          <span className="text-[12.5px] font-medium">{row.original.programmeInterest.name}</span>
        </div>
      ) : '—',
    },
    {
      id: 'channel', header: 'Channel', accessorFn: r => r.inquiryChannel,
      cell: ({ getValue }) => <span className="text-[12.5px]">{CHANNEL_ICON[getValue()] ?? ''} {String(getValue()).replace('_', '-').toLowerCase()}</span>,
    },
    {
      id: 'routing', header: 'Routing', accessorFn: r => r.assignedUnit?.code ?? 'unrouted',
      cell: ({ row }) => {
        const l = row.original;
        return l.assignedUnit
          ? <Badge tone="green">→ {l.assignedUnit.code}</Badge>
          : l.suggestedUnit
            ? <Badge tone="honey">suggest {l.suggestedUnit.code}</Badge>
            : <Badge tone="stone">unrouted</Badge>;
      },
    },
    {
      id: 'area', header: 'Area', accessorFn: r => r.areaLocality ?? '',
      cell: ({ getValue }) => getValue() ? <span className="inline-flex items-center gap-1 text-[12px] text-stone-600"><MapPin className="h-3 w-3 text-stone-500" />{getValue()}</span> : '—',
    },
    {
      id: 'score', header: 'Score', accessorFn: r => r.leadScore,
      cell: ({ getValue }) => {
        const v = Number(getValue());
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-12 overflow-hidden rounded-full shadow-neo-inset-sm bg-[#EFE1B9]">
              <div className={cn('h-full rounded-full', v >= 60 ? 'bg-emerald-400' : v >= 40 ? 'bg-honey-400' : 'bg-stone-300')} style={{ width: `${v}%` }} />
            </div>
            <span className="text-xs font-bold">{v}</span>
          </div>
        );
      },
    },
    { id: 'received', header: 'Received', accessorFn: r => r.createdAt, cell: ({ getValue }) => <span className="text-xs text-stone-600">{fmtDate(getValue())}</span> },
  ], []);

  return (
    <div>
      <PageHeader
        title="First Buzz CRM" count={`${leads.length} leads`}
        subtitle="9-stage inquiry pipeline · central hub routing to 3 units"
        action={
          <div className="flex items-center gap-2.5">
            <div className="seg">
              <button className={cn('seg-item', view === 'list' && 'seg-item-active')} onClick={() => setView('list')}><List className="h-3.5 w-3.5" /> List</button>
              <button className={cn('seg-item', view === 'board' && 'seg-item-active')} onClick={() => setView('board')}><LayoutGrid className="h-3.5 w-3.5" /> Board</button>
            </div>
            <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Lead</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2.5">
        <span className="chip"><span className="chip-dot bg-sky-400" /> Open <b>{open}</b></span>
        <span className="chip"><span className="chip-dot bg-emerald-400" /> Enrolled <b>{enrolled}</b></span>
        <span className="chip"><span className="chip-dot bg-rose-400" /> Lost <b>{lost}</b></span>
        <span className="chip">Total <b>{leads.length}</b></span>
        <span className="chip"><span className="chip-dot bg-honey-400" /> Unrouted <b className="text-honey-700">{unrouted}</b></span>
        <span className="chip">Conversion <b className="text-sky-600">{conversion}%</b></span>
      </div>

      {view === 'list' ? (
        <DataTable
          columns={columns} data={leads} isLoading={isLoading}
          title="Lead Pipeline" searchPlaceholder="Search pipeline…" exportName="leads"
          filterable={[{ id: 'stage', label: 'Stage' }, { id: 'routing', label: 'Routing' }, { id: 'programme', label: 'Programme' }, { id: 'channel', label: 'Channel' }]}
          onRowClick={row => setOpenLead(row.id)}
        />
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-3">
          {STAGE_ORDER.map(stage => {
            const items = leads.filter(l => l.stage === stage);
            const meta = STAGE_META[stage];
            return (
              <div key={stage} className="w-60 shrink-0">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 font-heading text-[11px] font-extrabold uppercase tracking-wider text-stone-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.colour }} /> {meta.label}
                  </span>
                  <span className="chip px-2 py-0.5 text-[10px]">{items.length}</span>
                </div>
                <div className="space-y-2.5 min-h-[60px]">
                  {items.map(l => (
                    <button key={l.id} className="card w-full p-3.5 text-left hover:shadow-lift transition" onClick={() => setOpenLead(l.id)}>
                      <div className="font-bold text-[12.5px]">{l.parentName}</div>
                      <div className="text-[11px] text-stone-500">{l.childName ?? '—'} · {l.programmeInterest?.name ?? ''}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-stone-500">{l.inquiryNo.split('-').slice(-1)}</span>
                        {l.assignedUnit ? <Badge tone="green">{l.assignedUnit.code}</Badge> : <Badge tone="stone">—</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddLeadModal onClose={() => setAdding(false)} />}
      {openLead && <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

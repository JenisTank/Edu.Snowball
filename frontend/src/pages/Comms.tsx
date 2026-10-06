import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Check, FileText, Megaphone, MessageSquare, Send, Smartphone } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';
import { cn } from '../lib/utils';

const TYPE_META: Record<string, { label: string; tone: any }> = {
  ANNOUNCEMENT: { label: 'Announcement', tone: 'honey' },
  ABSENCE_ALERT: { label: 'Absence alert', tone: 'red' },
  FEE_REMINDER: { label: 'Fee reminder', tone: 'sky' },
  RECEIPT: { label: 'Receipt', tone: 'green' },
  ESCALATION_3DAY: { label: '3-day escalation', tone: 'violet' },
  ADMIN_CALL: { label: 'Admin call', tone: 'stone' },
};


// ═════════════ HO Template Management (spec B2) ═════════════
// Head Office owns every word that reaches a parent. Units consume templates,
// they never write them. `bspName` links a template to its approved WhatsApp
// template once the BSP account is live.
function TemplatesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = ['FOUNDER', 'ACADEMIC_DIR'].includes(user!.role);
  const [editing, setEditing] = useState<any>(null);
  const [body, setBody] = useState('');
  const [bspName, setBspName] = useState('');
  const [err, setErr] = useState('');

  const { data: templates = [], isLoading } = useQuery({ queryKey: ['comms-templates'], queryFn: () => api('/comms/templates') });
  const { data: preview } = useQuery({
    queryKey: ['tpl-preview', body],
    queryFn: () => api('/comms/templates/preview', { method: 'POST', body: JSON.stringify({ body }) }),
    enabled: !!body,
  });

  const save = useMutation({
    mutationFn: () => api('/comms/templates', { method: 'POST', body: JSON.stringify({ code: editing.code, name: editing.name, body, bspName }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comms-templates'] }); setEditing(null); },
    onError: (e: any) => setErr(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (v: { code: string; status: string }) => api(`/comms/templates/${v.code}/status`, { method: 'PATCH', body: JSON.stringify({ status: v.status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comms-templates'] }),
    onError: (e: any) => setErr(e.message),
  });

  const TONE: Record<string, any> = { APPROVED: 'green', SUBMITTED: 'sky', REJECTED: 'red', DRAFT: 'stone' };

  return (
    <div>
      {err && <ErrorNote msg={err} />}
      <div className="mb-3 rounded-xl bg-honey-100 px-3 py-2 text-[11.5px] font-bold text-honey-800">
        Wording is Head-Office-locked. Submit each template to the WhatsApp BSP, then record the approved template name here —
        delivery switches from app push to WhatsApp automatically once <code>WA_BSP_KEY</code> is set.
      </div>
      {isLoading && <div className="card p-6 text-[13px] font-semibold text-stone-500">Loading templates…</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t: any) => (
          <div key={t.code} className="card flex flex-col p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-extrabold">{t.name}</div>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-stone-400">{t.code}</div>
              </div>
              <Badge tone={TONE[t.status] ?? 'stone'} dot>{t.status}</Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-cream-50 px-3 py-2 text-[12px] font-semibold text-stone-600">{t.body}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(t.variables ?? []).map((v: string) => <span key={v} className="chip !px-2 !py-0.5 font-mono text-[10px]">{'{' + v + '}'}</span>)}
              {t.bspName && <span className="chip !px-2 !py-0.5 text-[10px]">BSP: <b>{t.bspName}</b></span>}
              {t.builtIn && <span className="chip !px-2 !py-0.5 text-[10px] text-stone-400">built-in default</span>}
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-neo !py-1.5 text-[11.5px]" onClick={() => { setErr(''); setEditing(t); setBody(t.body); setBspName(t.bspName ?? ''); }}>Edit wording</button>
                {!t.builtIn && t.status !== 'APPROVED' && (
                  <button className="btn-neo !py-1.5 text-[11.5px]" onClick={() => setStatus.mutate({ code: t.code, status: t.status === 'DRAFT' ? 'SUBMITTED' : 'APPROVED' })}>
                    {t.status === 'DRAFT' ? 'Mark submitted to BSP' : 'Mark approved'}
                  </button>
                )}
                {t.status === 'APPROVED' && <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700"><Check className="h-3.5 w-3.5" /> live-ready</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={`✏️ ${editing.name}`} onClose={() => setEditing(null)} wide>
          <div className="space-y-3">
            <Field label="Message wording" hint="Use {variable} placeholders — they are filled per child at send time.">
              <textarea className="input min-h-32 font-mono text-[12.5px]" value={body} onChange={e => setBody(e.target.value)} />
            </Field>
            <Field label="Approved WhatsApp template name (from the BSP)" hint="Leave blank until the BSP approves it.">
              <input className="input" value={bspName} onChange={e => setBspName(e.target.value)} placeholder="bb_absence_alert_v1" />
            </Field>
            {preview && (
              <div>
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Preview with sample data</div>
                <div className="whitespace-pre-wrap rounded-xl bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-stone-700">{preview.text}</div>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-neo" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" disabled={save.isPending || !body.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save template'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════ Parent ↔ Centre Head conversations ═════════════
function ThreadsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<any>(null);
  const [reply, setReply] = useState('');
  const { data: threads = [], isLoading } = useQuery({ queryKey: ['comms-threads'], queryFn: () => api('/comms/threads') });
  const { data: thread } = useQuery({
    queryKey: ['comms-thread', open?.studentId],
    queryFn: () => api(`/comms/threads/${open.studentId}`),
    enabled: !!open,
  });
  const send = useMutation({
    mutationFn: () => api(`/comms/threads/${open.studentId}/reply`, { method: 'POST', body: JSON.stringify({ body: reply }) }),
    onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['comms-thread', open.studentId] }); qc.invalidateQueries({ queryKey: ['comms-threads'] }); },
  });

  return (
    <div>
      {isLoading && <div className="card p-6 text-[13px] font-semibold text-stone-500">Loading conversations…</div>}
      {!isLoading && threads.length === 0 && (
        <div className="card p-8 text-center text-[13px] font-semibold text-stone-500">
          No parent messages yet. Parents can start a conversation from the parent app.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {threads.map((t: any) => (
          <button key={t.studentId} className="card p-4 text-left transition hover:-translate-y-0.5" onClick={() => setOpen(t)}>
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] font-extrabold">{t.student.firstName} {t.student.lastName}</span>
              {t.unread > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white">{t.unread} new</span>}
            </div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-stone-400">{t.student.admissionNo} · {t.count} message(s)</div>
            <p className="mt-2 line-clamp-2 text-[12px] font-semibold text-stone-600">
              {t.last.direction === 'PARENT_TO_CENTRE' ? '👪 ' : '🐝 '}{t.last.body}
            </p>
          </button>
        ))}
      </div>

      {open && (
        <Modal title={`💬 ${open.student.firstName} ${open.student.lastName}`} onClose={() => { setOpen(null); qc.invalidateQueries({ queryKey: ['comms-threads'] }); }} wide>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {(thread?.messages ?? []).map((m: any) => (
              <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] font-semibold',
                m.direction === 'PARENT_TO_CENTRE' ? 'bg-stone-100 text-stone-700' : 'ml-auto bg-honey-100 text-honey-900')}>
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-stone-400">{m.authorName} · {fmtDate(m.createdAt)}</div>
                {m.body}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input flex-1" placeholder="Reply to the parent…" value={reply}
              onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && reply.trim()) send.mutate(); }} />
            <button className="btn-primary" disabled={!reply.trim() || send.isPending} onClick={() => send.mutate()}>
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[10.5px] font-semibold text-stone-400">The parent gets an app notification instantly; WhatsApp/email follow on dispatch.</p>
        </Modal>
      )}
    </div>
  );
}

export default function Comms() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canSend = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const [tab, setTab] = useState<'outbox' | 'templates' | 'messages'>('outbox');
  const [announcing, setAnnouncing] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [err, setErr] = useState('');

  const { data: sm } = useQuery({ queryKey: ['comms-summary'], queryFn: () => api('/comms/summary') });
  const { data: msgs = [], isLoading } = useQuery({ queryKey: ['comms-messages'], queryFn: () => api('/comms/messages') });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['comms-messages'] }); qc.invalidateQueries({ queryKey: ['comms-summary'] }); };
  const announce = useMutation({
    mutationFn: () => api('/comms/announce', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { refresh(); setAnnouncing(false); setForm({ title: '', body: '' }); },
    onError: (e: any) => setErr(e.message),
  });
  const dispatch = useMutation({
    mutationFn: () => api('/comms/dispatch', { method: 'POST' }),
    onSuccess: refresh,
  });

  const cols = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => <span className="whitespace-nowrap text-[12px] font-semibold text-stone-600">{fmtDate(row.original.createdAt)}</span> },
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => { const m = TYPE_META[row.original.type] ?? { label: row.original.type, tone: 'stone' }; return <Badge tone={m.tone}>{m.label}</Badge>; } },
    { id: 'student', accessorFn: (r: any) => r.student ? `${r.student.firstName} ${r.student.lastName}` : (r.payload?.child ?? '—'), header: 'Student', cell: ({ getValue }) => <span className="font-bold">{getValue() as string}</span> },
    { id: 'summary', header: 'Content', cell: ({ row }) => {
      const p = row.original.payload ?? {};
      const t = row.original.type;
      return <span className="block max-w-md truncate text-[12px] font-semibold text-stone-600">
        {t === 'ANNOUNCEMENT' ? `${p.title} — ${p.body}` : t === 'FEE_REMINDER' ? `${p.stage} · Inst #${p.instalmentNo} · ₹${Number(p.amountDue ?? 0).toLocaleString('en-IN')}` : t === 'RECEIPT' ? `${p.receiptNo} · ₹${Number(p.amount ?? 0).toLocaleString('en-IN')}` : (p.child ?? '')}
      </span>;
    } },
    { accessorKey: 'recipient', header: 'To', cell: ({ row }) => <span className="text-[12px] font-semibold text-stone-500">{row.original.recipient}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge tone={row.original.status === 'SENT' ? 'green' : row.original.status === 'FAILED' ? 'red' : 'honey'} dot>{row.original.status}</Badge> },
  ], []);

  return (
    <div>
      <PageHeader
        title="Communication" count={sm ? `${sm.total} messages` : undefined}
        subtitle="One outbox for every parent-facing message · delivery chain: app push → WhatsApp → email"
        action={canSend && (
          <div className="flex gap-2">
            <button className="btn-neo" disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
              <Send className="mr-1.5 inline h-3.5 w-3.5" />{dispatch.isPending ? 'Dispatching…' : 'Dispatch queue'}
            </button>
            <button className="btn-primary" onClick={() => { setErr(''); setAnnouncing(true); }}>
              <Megaphone className="mr-1.5 inline h-3.5 w-3.5" />New announcement
            </button>
          </div>
        )}
      />

      {sm && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="chip"><Smartphone className="h-3 w-3 text-honey-700" /> Mode <b>{sm.sandbox ? 'SANDBOX' : 'LIVE'}</b></span>
          {sm.channels && (['push', 'whatsapp', 'email'] as const).map(c => (
            <span key={c} className="chip capitalize">
              <span className={cn('chip-dot', sm.channels[c] ? 'bg-emerald-400' : 'bg-stone-300')} />{c} {sm.channels[c] ? 'on' : 'off'}
            </span>
          ))}
          <span className="chip"><span className="chip-dot bg-amber-400" /> Queued <b>{sm.byStatus.QUEUED ?? 0}</b></span>
          <span className="chip"><span className="chip-dot bg-emerald-400" /> Sent <b>{sm.byStatus.SENT ?? 0}</b></span>
          {Object.entries(sm.byType as Record<string, number>).map(([t, n]) => (
            <span key={t} className="chip hidden lg:inline-flex">{TYPE_META[t]?.label ?? t} <b>{n}</b></span>
          ))}
        </div>
      )}
      {dispatch.data && (
        <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-bold text-emerald-700">
          Dispatched {dispatch.data.sent} of {dispatch.data.total} — push {dispatch.data.push} · WhatsApp {dispatch.data.whatsapp} · email {dispatch.data.email}
          {dispatch.data.sandbox > 0 && ` · ${dispatch.data.sandbox} simulated (sandbox)`}
          {dispatch.data.failed > 0 && ` · ${dispatch.data.failed} failed`}
          {dispatch.data.mode === 'SANDBOX' && ' — real WhatsApp delivery starts once BSP keys are added to .env'}
        </div>
      )}

      <div className="mb-4 flex">
        <div className="seg">
          {([['outbox', 'Outbox', Send], ['templates', 'Templates', FileText], ['messages', 'Parent messages', MessageSquare]] as const).map(([k, label, Icon]) => (
            <button key={k} className={cn('seg-item', tab === k && 'seg-item-active')} onClick={() => setTab(k as any)}>
              <Icon className="mr-1 inline h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'templates' && <TemplatesTab />}
      {tab === 'messages' && <ThreadsTab />}
      {tab === 'outbox' && <DataTable columns={cols} data={msgs} isLoading={isLoading} title="Message outbox"
        searchPlaceholder="Search messages…" exportName="messages"
        filterable={[{ id: 'type', label: 'Type' }, { id: 'status', label: 'Status' }]} />}

      {announcing && (
        <Modal title="📣 New announcement" onClose={() => setAnnouncing(false)}>
          {err && <ErrorNote msg={err} />}
          <div className="space-y-3">
            <Field label="Title"><input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Diwali Break 🎆" /></Field>
            <Field label="Message"><textarea className="input min-h-28" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Dear parents…" /></Field>
            <div className="rounded-xl bg-honey-100 px-3 py-2 text-[11.5px] font-bold text-honey-800">
              Goes to every active family{HO_ROLES.includes(user!.role) ? ' across all units' : ' in your unit'} — one WhatsApp per household.
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-neo" onClick={() => setAnnouncing(false)}>Cancel</button>
            <button className="btn-primary" disabled={announce.isPending || !form.title || !form.body} onClick={() => announce.mutate()}>
              {announce.isPending ? 'Queuing…' : 'Queue announcement'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

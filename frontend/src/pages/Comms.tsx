import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Megaphone, Send, Smartphone, MessageCircle } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable, Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';

const TYPE_META: Record<string, { label: string; tone: any }> = {
  ANNOUNCEMENT: { label: 'Announcement', tone: 'honey' },
  ABSENCE_ALERT: { label: 'Absence alert', tone: 'red' },
  FEE_REMINDER: { label: 'Fee reminder', tone: 'sky' },
  RECEIPT: { label: 'Receipt', tone: 'green' },
  ESCALATION_3DAY: { label: '3-day escalation', tone: 'violet' },
  ADMIN_CALL: { label: 'Admin call', tone: 'stone' },
};

export default function Comms() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canSend = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user!.role);
  const [announcing, setAnnouncing] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [err, setErr] = useState('');
  const [replying, setReplying] = useState<any>(null);
  const [replyBody, setReplyBody] = useState('');

  const { data: sm } = useQuery({ queryKey: ['comms-summary'], queryFn: () => api('/comms/summary') });
  const { data: parentMsgs = [] } = useQuery({ queryKey: ['parent-messages'], queryFn: () => api('/comms/parent-messages') });
  const { data: msgs = [], isLoading } = useQuery({ queryKey: ['comms-messages'], queryFn: () => api('/comms/messages') });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['comms-messages'] }); qc.invalidateQueries({ queryKey: ['comms-summary'] }); };
  const announce = useMutation({
    mutationFn: () => api('/comms/announce', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => { refresh(); setAnnouncing(false); setForm({ title: '', body: '' }); },
    onError: (e: any) => setErr(e.message),
  });
  const reply = useMutation({ mutationFn: () => api(`/comms/parent-messages/${replying.studentId}/reply`, { method: 'POST', body: JSON.stringify({ body: replyBody }) }), onSuccess: () => { setReplying(null); setReplyBody(''); qc.invalidateQueries({ queryKey: ['parent-messages'] }); }, onError: (e:any) => setErr(e.message) });
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
        subtitle="One outbox for every parent-facing message · WhatsApp BSP connects via .env keys (running in sandbox mode)"
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
          <span className="chip"><span className="chip-dot bg-amber-400" /> Queued <b>{sm.byStatus.QUEUED ?? 0}</b></span>
          <span className="chip"><span className="chip-dot bg-emerald-400" /> Sent <b>{sm.byStatus.SENT ?? 0}</b></span>
          {Object.entries(sm.byType as Record<string, number>).map(([t, n]) => (
            <span key={t} className="chip hidden lg:inline-flex">{TYPE_META[t]?.label ?? t} <b>{n}</b></span>
          ))}
        </div>
      )}
      {dispatch.data && <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12.5px] font-bold text-emerald-700">Dispatched {dispatch.data.sent} message(s) in {dispatch.data.mode} mode{dispatch.data.mode === 'SANDBOX' && ' — real WhatsApp delivery starts once BSP keys are added to .env'}.</div>}

      <DataTable columns={cols} data={msgs} isLoading={isLoading} title="Message outbox"
        searchPlaceholder="Search messages…" exportName="messages"
        filterable={[{ id: 'type', label: 'Type' }, { id: 'status', label: 'Status' }]} />

      <div className="card mt-4 p-5">
        <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold"><MessageCircle className="h-4 w-4 text-honey-700"/>Parent questions <span className="chip ml-auto">{parentMsgs.filter((m:any)=>m.sender==='PARENT'&&!m.readAt).length} unread</span></div>
        {!parentMsgs.length && <div className="py-4 text-center text-[12px] font-semibold text-stone-400">No parent questions yet.</div>}
        <div className="space-y-2">{parentMsgs.slice(0,20).map((m:any)=><div key={m.id} className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2"><div className="min-w-0 flex-1"><div className="text-[11px] font-extrabold">{m.student?.firstName} {m.student?.lastName} · {m.sender==='PARENT'?'Parent':'Centre Head'}</div><div className="truncate text-[12px] font-semibold text-stone-600">{m.body}</div></div><span className="text-[10px] font-semibold text-stone-400">{fmtDate(m.createdAt)}</span>{canSend&&m.sender==='PARENT'&&<button className="btn-neo !px-3 !py-1.5 text-[11px]" onClick={()=>{setErr('');setReplying(m)}}>Reply</button>}</div>)}</div>
      </div>

      {replying && <Modal title={`Reply to ${replying.student?.firstName}'s parent`} onClose={()=>setReplying(null)}>{err&&<ErrorNote msg={err}/>}<Field label="Reply"><textarea autoFocus maxLength={1000} className="input min-h-28" value={replyBody} onChange={e=>setReplyBody(e.target.value)} /></Field><div className="mt-4 flex justify-end gap-2"><button className="btn-neo" onClick={()=>setReplying(null)}>Cancel</button><button className="btn-primary" disabled={!replyBody.trim()||reply.isPending} onClick={()=>reply.mutate()}><Send className="mr-1 inline h-3.5 w-3.5"/>Send reply</button></div></Modal>}

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

// ─────────────────────────────────────────────────────────────
// BumbleB Kidz · Parent Portal (PWA) — Slice 6
// Playful light theme, mobile-first. Parents log in with their
// registered phone + child's admission number. Installable PWA.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BellRing, CalendarDays, ChevronLeft, ChevronRight, GraduationCap,
  IndianRupee, LogOut, Printer, Smile, Sun,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── tiny parent-scoped API client (separate from staff session) ──
const pstore = {
  get: () => { try { return localStorage.getItem('bb_parent_token'); } catch { return null; } },
  set: (t: string) => {
    try { localStorage.setItem('bb_parent_token', t); } catch { /* ignore */ }
    try { document.cookie = `bb_token=${encodeURIComponent(t)}; path=/; max-age=604800; SameSite=None; Secure`; } catch { /* for receipt print tabs */ }
  },
  del: () => { try { localStorage.removeItem('bb_parent_token'); } catch { /* ignore */ } },
};
async function papi(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(pstore.get() ? { 'x-bb-token': pstore.get()! } : {}), ...(opts.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? 'Something went wrong');
  return body;
}

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────── Login ───────────────────────────
function ParentLogin({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await papi('/parent/login', { method: 'POST', body: JSON.stringify({ phone, admissionNo }) });
      pstore.set(r.accessToken);
      onDone();
    } catch (ex: any) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 font-body text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-5xl">🐝</div>
          <h1 className="mt-2 font-heading text-2xl font-extrabold text-honey-700">BumbleB Kidz</h1>
          <p className="text-[13px] font-semibold text-stone-500">Parent Portal · see your little bee bloom</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-bold text-rose-600">{err}</div>}
          <div>
            <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Registered mobile</label>
            <input className="input" placeholder="+91 9XXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-stone-500">Child's admission no.</label>
            <input className="input" placeholder="BB-U1-2627-0001" value={admissionNo} onChange={e => setAdmissionNo(e.target.value)} required />
          </div>
          <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Checking…' : 'Enter the hive 🍯'}</button>
          <p className="text-center text-[10.5px] font-semibold text-stone-400">Both are printed on your fee receipt. Trouble logging in? Call your centre.</p>
        </form>
      </div>
    </div>
  );
}

// ───────────────────── Attendance calendar ─────────────────────
function AttendanceCard({ childId }: { childId: string }) {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const { data } = useQuery({ queryKey: ['p-att', childId, ym], queryFn: () => papi(`/parent/child/${childId}/attendance?month=${ym}`) });
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const map = new Map<number, string>();
  data?.records.forEach((r: any) => map.set(new Date(r.date).getDate(), r.status));
  const shift = (d: number) => {
    const n = new Date(y, m - 1 + d, 1);
    setYm(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`);
  };
  const tone: Record<string, string> = { PRESENT: 'bg-emerald-400 text-white', ABSENT: 'bg-rose-400 text-white', LEAVE: 'bg-sky-400 text-white' };
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-heading text-[15px] font-extrabold"><CalendarDays className="h-4 w-4 text-honey-700" /> Attendance</div>
        <div className="flex items-center gap-1">
          <button className="btn-neo-icon !h-7 !w-7" onClick={() => shift(-1)}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="w-20 text-center text-[12.5px] font-extrabold">{MONTHS[m - 1]} {y}</span>
          <button className="btn-neo-icon !h-7 !w-7" onClick={() => shift(1)}><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="text-center text-[10px] font-extrabold text-stone-400">{d}</div>)}
        {Array.from({ length: first.getDay() }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const st = map.get(i + 1);
          return <div key={i} className={cn('grid h-8 place-items-center rounded-lg text-[11.5px] font-bold',
            st ? tone[st] : 'bg-stone-100 text-stone-400')}>{i + 1}</div>;
        })}
      </div>
      {data && (
        <div className="mt-3 flex gap-2">
          <span className="chip"><span className="chip-dot bg-emerald-400" /> {data.counts.PRESENT} present</span>
          <span className="chip"><span className="chip-dot bg-rose-400" /> {data.counts.ABSENT} absent</span>
          <span className="chip"><span className="chip-dot bg-sky-400" /> {data.counts.LEAVE} leave</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────── Fees card ─────────────────────
function FeesCard({ childId }: { childId: string }) {
  const { data: f } = useQuery({ queryKey: ['p-fees', childId], queryFn: () => papi(`/parent/child/${childId}/fees`) });
  if (!f) return <div className="card p-5 text-[13px] font-semibold text-stone-500">Loading fees…</div>;
  const pct = f.net > 0 ? Math.min(100, Math.round(f.paid / f.net * 100)) : 100;
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold"><IndianRupee className="h-4 w-4 text-honey-700" /> Fees · AY 2026-27</div>
      <div className="mb-1.5 flex items-end justify-between text-[12.5px] font-bold">
        <span className="text-emerald-700">{inr(f.paid)} paid</span>
        <span className={f.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}>{f.balance > 0 ? `${inr(f.balance)} due` : 'All clear 🎉'}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${pct}%` }} />
      </div>
      {f.discount > 0 && <div className="mt-2 text-[11.5px] font-bold text-pink-600">Sibling concession applied: −{inr(f.discount)} 💛</div>}
      <div className="mt-3 space-y-1.5">
        {f.instalments.map((i: any) => (
          <div key={i.no} className="flex items-center justify-between rounded-xl bg-cream-50 px-3 py-2 text-[12.5px]">
            <span className="font-bold">Instalment {i.no}</span>
            <span className="font-semibold text-stone-500">due {new Date(i.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            <span className="font-extrabold">{inr(i.amount)}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold',
              i.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : i.status === 'OVERDUE' ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-700')}>{i.status}</span>
          </div>
        ))}
      </div>
      {f.receipts.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-wide text-stone-400">Receipts</div>
          {f.receipts.slice(0, 4).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between py-1 text-[12px]">
              <span className="font-bold">{r.receiptNo}</span>
              <span className="font-semibold text-stone-500">{inr(r.amount)}</span>
              <button className="btn-neo-icon !h-7 !w-7" onClick={() => window.open(`/api/fees/receipt/${r.id}/print`, '_blank')}><Printer className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-[10px] font-semibold text-stone-400">Online payment (UPI / Razorpay) activates at go-live — pay at your centre for now.</p>
    </div>
  );
}

// ───────────────────── Messages feed ─────────────────────
function MessagesCard() {
  const { data: msgs = [] } = useQuery({ queryKey: ['p-msgs'], queryFn: () => papi('/parent/messages') });
  const LABEL: Record<string, [string, string]> = {
    ANNOUNCEMENT: ['📣', 'bg-amber-50'], ABSENCE_ALERT: ['🏠', 'bg-rose-50'],
    FEE_REMINDER: ['💰', 'bg-sky-50'], RECEIPT: ['🧾', 'bg-emerald-50'],
  };
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold"><BellRing className="h-4 w-4 text-honey-700" /> Updates</div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {msgs.length === 0 && <div className="py-4 text-center text-[12px] font-semibold text-stone-400">No updates yet.</div>}
        {msgs.map((m: any) => {
          const [icon, bg] = LABEL[m.type] ?? ['🔔', 'bg-stone-50'];
          return (
            <div key={m.id} className={cn('rounded-xl px-3 py-2.5', bg)}>
              <div className="flex items-center gap-2 text-[12.5px] font-extrabold">
                <span>{icon}</span>
                <span>{m.type === 'ANNOUNCEMENT' ? m.payload?.title
                  : m.type === 'ABSENCE_ALERT' ? `${m.payload?.child ?? m.student?.firstName} was absent`
                  : m.type === 'FEE_REMINDER' ? `Fee reminder · instalment ${m.payload?.instalmentNo}`
                  : `Receipt ${m.payload?.receiptNo}`}</span>
                <span className="ml-auto text-[10px] font-semibold text-stone-400">{new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-stone-600">
                {m.type === 'ANNOUNCEMENT' ? m.payload?.body
                  : m.type === 'FEE_REMINDER' ? `${inr(m.payload?.amountDue)} due by ${new Date(m.payload?.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                  : m.type === 'RECEIPT' ? `${inr(m.payload?.amount)} received — thank you!`
                  : `on ${m.payload?.date} · if this is unexpected, call your centre`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────── Portal shell ─────────────────────
export default function ParentPortal() {
  const [authed, setAuthed] = useState(!!pstore.get());
  const [childId, setChildId] = useState('');
  const { data: kids = [], isError } = useQuery({
    queryKey: ['p-kids', authed],
    queryFn: () => papi('/parent/children'),
    enabled: authed, retry: false,
  });
  useEffect(() => { if (isError) { pstore.del(); setAuthed(false); } }, [isError]);
  useEffect(() => { if (!childId && kids.length) setChildId(kids[0].id); }, [kids, childId]);

  if (!authed) return <ParentLogin onDone={() => setAuthed(true)} />;
  const kid = kids.find((k: any) => k.id === childId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50 pb-10 font-body text-ink">
      <header className="sticky top-0 z-10 border-b border-amber-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="text-2xl">🐝</span>
          <div className="min-w-0">
            <div className="font-heading text-[15px] font-extrabold text-honey-700">BumbleB Kidz</div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">Parent Portal</div>
          </div>
          <button className="btn-neo ml-auto !px-3 !py-1.5 text-[11.5px]" onClick={() => { pstore.del(); setAuthed(false); }}>
            <LogOut className="mr-1 inline h-3 w-3" />Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        {/* child switcher */}
        {kids.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {kids.map((k: any) => (
              <button key={k.id} onClick={() => setChildId(k.id)}
                className={cn('whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-extrabold transition-all',
                  k.id === childId ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow' : 'bg-white text-stone-500 ring-1 ring-stone-200')}>
                {k.firstName}
              </button>
            ))}
          </div>
        )}

        {kid && (
          <>
            {/* hero card */}
            <div className="card flex items-center gap-4 p-5">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-400 text-3xl shadow-inner">
                {kid.today === 'PRESENT' ? '😊' : kid.today === 'ABSENT' ? '🏠' : '🐝'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[18px] font-extrabold">{kid.firstName} {kid.lastName}</div>
                <div className="text-[12px] font-semibold text-stone-500">{kid.admissionNo} · {kid.programme?.name} ({kid.programme?.tierName})</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                  {kid.today && (
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                      kid.today === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : kid.today === 'LEAVE' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-600')}>
                      <Smile className="h-3 w-3" />{kid.today === 'PRESENT' ? 'In school today' : kid.today === 'LEAVE' ? 'On leave today' : 'At home today'}
                    </span>
                  )}
                  <span className="chip"><GraduationCap className="h-3 w-3 text-honey-700" /> {kid.batch?.name ?? '—'}</span>
                  <span className="chip"><Sun className="h-3 w-3 text-honey-700" /> {kid.batch ? `${kid.batch.startTime}–${kid.batch.endTime}` : ''}</span>
                  <span className="chip">{kid.unit?.name}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AttendanceCard childId={kid.id} />
              <FeesCard childId={kid.id} />
            </div>
            <MessagesCard />
          </>
        )}
        <p className="pt-2 text-center text-[10px] font-semibold text-stone-400">BumbleB Kidz ERP · add this page to your home screen for the app experience 📲</p>
      </main>
    </div>
  );
}

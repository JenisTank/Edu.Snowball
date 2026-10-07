import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { BeeMark, Honeycomb } from '../components/brand/Logo';

const DEMO_ACCOUNTS = [
  { label: 'Founder', sub: 'All units · full access', email: 'founder@bumblebkidz.com' },
  { label: 'Centre Head', sub: 'Unit 1 — Saraswati', email: 'ch.u1@bumblebkidz.com' },
  { label: 'Teacher', sub: 'K1 · Unit 1', email: 'teacher.u1@bumblebkidz.com' },
  { label: 'Receptionist', sub: 'Central Admission Hub', email: 'reception@bumblebkidz.com' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e?: React.FormEvent, demoEmail?: string) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(demoEmail || email, demoEmail ? 'bumbleb123' : password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Brand panel ── */}
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-honey-500 via-honey-400 to-[color:var(--accent)] lg:block">
        <Honeycomb className="absolute -left-10 -top-10 h-[420px] w-[420px] text-white/60" />
        <Honeycomb className="absolute -bottom-16 -right-16 h-[380px] w-[380px] text-white/40 rotate-12" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/90 p-2.5 shadow-lift">
              <BeeMark className="h-9 w-9" />
            </div>
            <div className="font-heading text-xl font-extrabold text-white drop-shadow-sm">
              BumbleB Kidz
            </div>
          </div>

          <div>
            <h1 className="font-heading text-[2.6rem] font-black leading-[1.1] text-white drop-shadow-sm">
              Where little bees<br />grow &amp; bloom. 🌸
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
              One hive for the whole chain — admissions, attendance, fees,
              academics and parent connection across every BumbleB Kidz unit.
            </p>

            <div className="mt-8 flex gap-3">
              {['Brilliant ☀️', 'Buzzing 🐝', 'Blooming 🌸', 'Growing 🌱', 'Budding 🌀'].map(r => (
                <span key={r} className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/70">
            3 units · Rajkot &nbsp;·&nbsp; Todd Care → K2 &nbsp;·&nbsp; AY 2026-27
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex flex-1 items-center justify-center bg-cream px-6 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BeeMark className="h-10 w-10" />
            <span className="font-heading text-xl font-extrabold">BumbleB <span className="text-honey-500">Kidz</span></span>
          </div>

          <h2 className="font-heading text-[1.7rem] font-extrabold tracking-tight">Welcome back 👋</h2>
          <p className="mt-1 text-sm text-stone-600">Sign in to the BumbleB Kidz ERP</p>

          {new URLSearchParams(window.location.search).get('reason') === 'session' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              Your session could not be renewed, so you were signed out. Please sign in again —
              if this keeps happening repeatedly, tell Parth's AI developer 🐝
            </div>
          )}

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block font-heading text-xs font-bold uppercase tracking-wider text-stone-600">
                Email
              </label>
              <input
                className="input" type="email" required placeholder="you@bumblebkidz.com"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block font-heading text-xs font-bold uppercase tracking-wider text-stone-600">
                Password
              </label>
              <div className="relative">
                <input
                  className="input pr-10" type={showPw ? 'text' : 'password'} required placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
                {error}
              </div>
            )}

            <button className="btn-primary w-full py-3" disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Demo quick logins */}
          <div className="mt-8">
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <div className="h-px flex-1 bg-[color:var(--neu-border)]" />
              <Sparkles className="h-3.5 w-3.5 text-honey-400" />
              <span>Demo accounts — one click</span>
              <div className="h-px flex-1 bg-[color:var(--neu-border)]" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email} disabled={busy}
                  onClick={() => submit(undefined, acc.email)}
                  className="card group p-3 text-left transition hover:shadow-lift active:shadow-neo-inset"
                >
                  <div className="font-heading text-[13px] font-bold group-hover:text-honey-600 transition">
                    {acc.label}
                  </div>
                  <div className="text-[11px] text-stone-500">{acc.sub}</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-stone-500">
              All demo accounts · password <code className="rounded bg-stone-100 px-1.5 py-0.5">bumbleb123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

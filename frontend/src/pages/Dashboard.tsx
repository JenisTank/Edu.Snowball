import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, CalendarCheck, IndianRupee, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, fmtINR, fmtDate } from '../lib/api';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';

const STAGE_LABELS: Record<string, string> = {
  NEW_INQUIRY: 'New Inquiry', FIRST_BUZZ: 'First Buzz', ROUTING: 'Routing',
  EXPERIENCE_SESSION: 'Experience', DISCOVERY_FLIGHT: 'Discovery Flight',
  OFFER: 'Offer', CONFIRMATION: 'Confirmation', ENROLLED: 'Enrolled', LOST: 'Lost',
};
const STAGE_ORDER = ['NEW_INQUIRY', 'FIRST_BUZZ', 'ROUTING', 'EXPERIENCE_SESSION', 'DISCOVERY_FLIGHT', 'OFFER', 'CONFIRMATION', 'ENROLLED'];

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard/summary') });

  const attendancePct = data?.attendance.total
    ? Math.round((data.attendance.present / data.attendance.total) * 100) : 0;

  const stats = [
    { label: 'Active Students', value: data?.students ?? '—', icon: Users, tint: 'bg-honey-50 text-honey-600', foot: `${data?.batches ?? 0} active batches` },
    { label: 'Open Leads', value: data?.leadsOpen ?? '—', icon: Megaphone, tint: 'bg-sky-50 text-sky-600', foot: 'First Buzz pipeline' },
    { label: "Today's Attendance", value: data ? `${attendancePct}%` : '—', icon: CalendarCheck, tint: 'bg-emerald-50 text-emerald-600', foot: data ? `${data.attendance.present} of ${data.attendance.total} present` : '' },
    { label: 'Fees Collected', value: data ? fmtINR(data.fees.collected) : '—', icon: IndianRupee, tint: 'bg-violet-50 text-violet-600', foot: `${data?.fees.receipts ?? 0} receipts · AY 2026-27` },
  ];

  const maxFunnel = Math.max(1, ...(data?.funnel?.map((f: any) => f.count) ?? [1]));
  const funnelByStage: Record<string, number> = Object.fromEntries((data?.funnel ?? []).map((f: any) => [f.stage, f.count]));

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.fullName.split(' ')[0]} 🐝`}
        subtitle={`${ROLE_LABELS[user?.role || ''] || ''} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="card p-5 transition hover:shadow-lift">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium text-stone-500">{s.label}</div>
                <div className="mt-1.5 font-heading text-[1.75rem] font-extrabold leading-none tracking-tight">
                  {isLoading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-stone-100" /> : s.value}
                </div>
              </div>
              <div className={`rounded-xl p-2.5 shadow-neo-inset-sm ${s.tint}`}>
                <s.icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-[11.5px] text-stone-500">{s.foot}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* ── Admission funnel ── */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-[15px] font-extrabold">Admission Funnel — First Buzz Pipeline</h3>
            <Link to="/leads" className="btn-ghost text-xs">View CRM <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="mt-5 space-y-3">
            {STAGE_ORDER.map(stage => {
              const count = funnelByStage[stage] ?? 0;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right text-xs font-semibold text-stone-600">{STAGE_LABELS[stage]}</div>
                  <div className="h-7 flex-1 overflow-hidden rounded-lg shadow-neo-inset-sm bg-[color:var(--sunken)]">
                    <div
                      className="flex h-full items-center rounded-lg bg-gradient-to-r from-honey-400 to-honey-500 pl-2.5 text-[11px] font-bold text-white transition-all duration-700"
                      style={{ width: count ? `${Math.max(9, (count / maxFunnel) * 100)}%` : '0%' }}
                    >
                      {count > 0 && count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Programme distribution ── */}
        <div className="card p-5">
          <h3 className="font-heading text-[15px] font-extrabold">Students by Programme</h3>
          <div className="mt-4 space-y-3.5">
            {(data?.programmeDistribution ?? []).map((p: any) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: p.colour }} />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold">{p.name}</span>
                    <span className="font-heading text-sm font-extrabold">{p.count}</span>
                  </div>
                  <div className="text-[11px] text-stone-500">{p.tierName}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-gradient-to-br from-sky-50 to-honey-50 p-3.5 text-xs leading-relaxed text-stone-600">
            <TrendingUp className="mb-1 h-4 w-4 text-sky-500" />
            Programme tiers are fixed per spec — Baby Bees through Brilliant Bees, never modified.
          </div>
        </div>
      </div>

      {/* ── Recent leads ── */}
      <div className="card mt-5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-[15px] font-extrabold">Recent Inquiries</h3>
          <Link to="/leads" className="btn-ghost text-xs">All leads <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="mt-3 divide-y divide-[color:var(--neu-border)]">
          {(data?.recentLeads ?? []).map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 font-heading text-sm font-extrabold text-sky-600">
                {l.parentName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{l.parentName}</div>
                <div className="truncate text-xs text-stone-500">
                  {l.childName ? `Child: ${l.childName} · ` : ''}{l.programmeInterest?.name ?? '—'} · {l.inquiryNo}
                </div>
              </div>
              <Badge tone={l.stage === 'ENROLLED' ? 'green' : l.stage === 'NEW_INQUIRY' ? 'sky' : 'honey'} dot>
                {STAGE_LABELS[l.stage]}
              </Badge>
              <span className="text-xs text-stone-500">{fmtDate(l.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

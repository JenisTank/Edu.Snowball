import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Phone, Mail, Users, CalendarClock } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';

export default function Units() {
  const { data: units, isLoading } = useQuery({ queryKey: ['units'], queryFn: () => api('/units') });
  const { data: batches } = useQuery({ queryKey: ['batches'], queryFn: () => api('/batches') });

  return (
    <div>
      <PageHeader
        title="Units & Batches"
        subtitle="3 company-owned units · Rajkot · franchise layer arrives in Phase 3"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(units ?? []).map((u: any) => (
          <div key={u.id} className="card p-5 transition hover:shadow-lift">
            <div className="flex items-start justify-between">
              <div className="rounded-xl shadow-neo-inset-sm p-2.5 text-honey-600">
                <Building2 className="h-5 w-5" />
              </div>
              <Badge tone={u.status === 'ACTIVE' ? 'green' : 'honey'} dot>
                {u.status === 'ACTIVE' ? 'Operational' : 'In Development'}
              </Badge>
            </div>
            <h3 className="mt-3 font-heading text-[15px] font-extrabold">{u.name}</h3>
            <div className="mt-2 space-y-1.5 text-[12.5px] text-stone-600">
              {u.address && <div className="flex gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-stone-400" />{u.address}</div>}
              {u.phone && <div className="flex gap-2 items-center"><Phone className="h-3.5 w-3.5 text-stone-400" />{u.phone} <span className="text-[10px] text-stone-400">(internal ops)</span></div>}
              {u.email && <div className="flex gap-2 items-center"><Mail className="h-3.5 w-3.5 text-stone-400" />{u.email}</div>}
            </div>
            <div className="mt-4 flex items-center gap-4 border-t border-[color:var(--neu-border)] pt-3 text-[12px] text-stone-600">
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-honey-500" /> {u._count.students} students</span>
              <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-sky-500" /> {u._count.batches} batches</span>
              <span className="ml-auto text-stone-500">Float ₹{Number(u.settings?.pettyCashFloat ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        ))}
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card h-56 animate-pulse bg-stone-50" />
        ))}
      </div>

      <h3 className="mb-3 mt-8 font-heading text-[15px] font-extrabold">Batches — AY 2026-27</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(batches ?? []).map((b: any) => (
          <div key={b.id} className="card p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: b.programme.levelColour }} />
              <span className="font-heading text-[13px] font-bold flex-1">{b.name}</span>
              <Badge tone="sky">{b.unit.code}</Badge>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-stone-500">
              <span>{b.programme.tierName}</span>
              <span className="capitalize">{b.shift} · {b.startTime}{b.endTime ? `–${b.endTime}` : ''}</span>
            </div>
            <div className="mt-2.5">
              <div className="flex justify-between text-[11px] text-stone-600 mb-1">
                <span>Seats</span><span className="font-semibold">{b._count.students} / {b.capacity}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full shadow-neo-inset-sm bg-[color:var(--sunken)]">
                <div
                  className={`h-full rounded-full ${b._count.students / b.capacity > 0.85 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, (b._count.students / b.capacity) * 100)}%` }}
                />
              </div>
            </div>
            <div className="mt-2 text-[10.5px] text-stone-400">
              Attendance locks {b.startTime} + 30 min (dynamic)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

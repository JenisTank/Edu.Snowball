import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, CalendarCheck, IdCard, PlaneTakeoff } from 'lucide-react';
import { api, fmtDate, fmtINR } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';
import { Field, ErrorNote } from '../components/ui/Modal';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * "My Space" — staff self-service.
 *
 * A teacher or coordinator can read their own profile, payslips and attendance
 * and file a leave application without asking HR. Every endpoint behind this
 * page is scoped to the logged-in staff member, never to an id in the URL.
 */

const LEAVE_LABEL: Record<string, string> = {
  CL: 'Casual leave',
  SL: 'Sick leave',
  PL: 'Paid leave',
};

const statusTone = (s: string) =>
  s === 'APPROVED' || s === 'PAYABLE' || s === 'PAID'
    ? 'green'
    : s === 'REJECTED' || s === 'CANCELLED'
      ? 'red'
      : s === 'PENDING_MANAGER' || s === 'PENDING_HR' || s === 'SUBMITTED'
        ? 'honey'
        : 'stone';

const hours = (mins: number) => `${Math.floor((mins || 0) / 60)}h ${(mins || 0) % 60}m`;

export default function Me() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ leaveType: 'CL', fromDate: '', toDate: '', reason: '' });

  const profile = useQuery({
    queryKey: ['me-profile'],
    queryFn: () => api('/me/profile'),
    retry: false,
  });
  const payslips = useQuery({
    queryKey: ['me-payslips'],
    queryFn: () => api('/me/payslips'),
    enabled: profile.isSuccess,
  });
  const leaves = useQuery({
    queryKey: ['me-leaves'],
    queryFn: () => api('/me/leaves'),
    enabled: profile.isSuccess,
  });
  const attendance = useQuery({
    queryKey: ['me-attendance', month],
    queryFn: () => api(`/me/attendance?month=${month}`),
    enabled: profile.isSuccess,
  });

  const apply = useMutation({
    mutationFn: () => api('/me/leaves', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-leaves'] });
      setForm({ leaveType: 'CL', fromDate: '', toDate: '', reason: '' });
    },
  });

  if (profile.isError) {
    return (
      <div>
        <PageHeader title={t('me.title')} subtitle={t('me.subtitle')} />
        <div className="card p-6">
          <p className="text-sm font-bold text-[color:var(--danger)]">
            {(profile.error as Error)?.message}
          </p>
          <p className="mt-2 text-xs font-semibold text-stone-500">
            HR links a login to an employee record through the email address. Once that is set,
            payslips and leave appear here.
          </p>
        </div>
      </div>
    );
  }

  const p = profile.data;
  const slips = payslips.data ?? [];
  const present = (attendance.data ?? []).filter((a: any) => a.status === 'PRESENT').length;

  return (
    <div>
      <PageHeader title={t('me.title')} subtitle={t('me.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-5">
          <div className="mb-1 flex items-center gap-2 font-heading text-[15px] font-extrabold">
            <IdCard className="h-4 w-4 text-honey-700" />
            {t('me.profile')}
          </div>
          {!p ? (
            <p className="text-xs text-stone-500">{t('common.loading')}</p>
          ) : (
            [
              [t('me.name'), p.fullName],
              [t('me.employeeNo'), p.employeeNo],
              ['Designation', p.designation],
              ['Department', p.department ?? '—'],
              ['Type', p.employmentType],
              ['Unit', p.unit?.name ?? '—'],
              ['Joined', fmtDate(p.joiningDate)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-2 text-[12.5px]">
                <span className="font-semibold text-stone-500">{k}</span>
                <span className="text-right font-extrabold">{v}</span>
              </div>
            ))
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold">
            <BadgeIndianRupee className="h-4 w-4 text-honey-700" />
            {t('me.payslips')}
          </div>
          {!slips.length ? (
            <p className="py-6 text-center text-[12px] font-semibold text-stone-400">
              {t('me.noPayslips')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {slips.map((s: any) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[12.5px]"
                >
                  <b className="w-20">{s.month}</b>
                  <span className="text-stone-500">{s.type}</span>
                  <span className="ml-auto font-extrabold">{fmtINR(s.net)}</span>
                  <Badge tone={statusTone(s.status) as any}>{s.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold">
            <PlaneTakeoff className="h-4 w-4 text-honey-700" />
            {t('me.leave')}
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Field label={t('me.leaveType')}>
                <select
                  className="input"
                  value={form.leaveType}
                  onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                >
                  {Object.entries(LEAVE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('me.from')}>
                <input
                  type="date"
                  className="input"
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                />
              </Field>
              <Field label={t('me.to')}>
                <input
                  type="date"
                  className="input"
                  value={form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t('me.reason')}>
              <textarea
                className="input min-h-16"
                maxLength={500}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </Field>
            <ErrorNote msg={(apply.error as Error)?.message} />
            <button
              className="btn-primary w-full"
              disabled={
                apply.isPending || !form.fromDate || !form.toDate || form.reason.trim().length < 5
              }
              onClick={() => apply.mutate()}
            >
              {apply.isPending ? t('common.loading') : t('me.applyLeave')}
            </button>
          </div>
          <div className="mt-3 space-y-1.5">
            {(leaves.data ?? []).slice(0, 6).map((l: any) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[11.5px]"
              >
                <b>{LEAVE_LABEL[l.leaveType] ?? l.leaveType}</b>
                <span className="text-stone-500">
                  {fmtDate(l.fromDate)} → {fmtDate(l.toDate)} · {Number(l.days)}d
                </span>
                <Badge tone={statusTone(l.status) as any}>{l.status.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-heading text-[15px] font-extrabold">
            <CalendarCheck className="h-4 w-4 text-honey-700" />
            {t('me.attendance')}
          </div>
          <div className="mb-2 flex items-center gap-2">
            <input
              type="month"
              aria-label={t('me.month')}
              className="input !w-40"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <span className="chip">
              {present} {t('me.daysPresent')}
            </span>
          </div>
          {!(attendance.data ?? []).length ? (
            <p className="py-6 text-center text-[12px] font-semibold text-stone-400">
              {t('me.noAttendance')}
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {(attendance.data ?? []).map((a: any) => (
                <div
                  key={a.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px]',
                    a.exception && !a.exceptionResolved ? 'bg-rose-50' : 'bg-white/60',
                  )}
                >
                  <span className="w-16 font-bold">{fmtDate(a.date)}</span>
                  <span className="text-stone-500">{hours(a.workedMinutes)}</span>
                  {a.lateMinutes > 0 && (
                    <span className="text-amber-700">+{a.lateMinutes}m late</span>
                  )}
                  <span className="ml-auto font-extrabold">{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

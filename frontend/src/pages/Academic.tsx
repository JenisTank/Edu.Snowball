import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CopyPlus, Lock, LockOpen, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useAuth, HO_ROLES } from '../lib/auth';
import { useI18n } from '../lib/i18n';

/**
 * Academic planning.
 *
 * Two audiences share one screen:
 *  - Head Office (Founder, Academic Director) authors a master and locks it,
 *  - a unit consumes the locked master and may adapt it with its own overlay.
 *
 * "Today" is a derived view over the Calendar and the Log Plan, so a teacher's
 * day view can never disagree with the plan that was approved.
 */

const kinds = ['YEARLY_GOAL', 'BIG_ROCK', 'CALENDAR', 'LOG_PLAN'];
const todayISO = () => new Date().toISOString().slice(0, 10);

const STATUS_TONE: Record<string, 'stone' | 'honey' | 'green' | 'violet'> = {
  DRAFT: 'stone',
  SUBMITTED: 'honey',
  APPROVED: 'green',
  LOCKED: 'violet',
};

function TodayPanel() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useQuery({
    queryKey: ['academic-day', date],
    queryFn: () => api(`/academic/daily-plan?date=${date}`),
  });
  const items: any[] = data?.items ?? [];
  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-honey-700" />
        <span className="font-heading text-[14px] font-extrabold">{t('academic.today')}</span>
        <input
          type="date"
          className="input ml-auto !w-auto !py-1 text-[12px]"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {isLoading && <div className="text-[13px] font-semibold text-stone-500">Loading…</div>}
      {!isLoading && items.length === 0 && (
        <div className="rounded-xl bg-white/60 p-4 text-[13px] font-semibold text-stone-500">
          {t('academic.nothingToday')}
        </div>
      )}
      <div className="space-y-2">
        {items.map((i) => (
          <div className="flex items-start gap-3 rounded-xl bg-white/60 p-3" key={i.id}>
            {i.timeLabel && (
              <span className="chip shrink-0 font-heading text-[11px]">{i.timeLabel}</span>
            )}
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13px]">{i.title}</b>
              {i.description && (
                <p className="mt-0.5 line-clamp-2 text-[12px] text-stone-600">{i.description}</p>
              )}
            </div>
            <Badge tone={i.source === 'CALENDAR' ? 'honey' : 'stone'}>
              {i.source === 'CALENDAR' ? t('academic.calendar') : t('academic.logPlan')}
            </Badge>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-stone-500">{t('academic.derivedHint')}</p>
    </div>
  );
}

export default function Academic() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { user } = useAuth();
  const isHo = HO_ROLES.includes(user!.role);
  const [kind, setKind] = useState('YEARLY_GOAL');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState<any>({ title: '', description: '', academicYear: '2026-27' });

  const { data: rows = [] } = useQuery({
    queryKey: ['academic', kind],
    queryFn: () => api(`/academic?kind=${kind}`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['academic'] });

  const save = useMutation({
    mutationFn: () => api('/academic', { method: 'POST', body: JSON.stringify({ ...f, kind }) }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setF({ title: '', description: '', academicYear: '2026-27' });
      setErr('');
    },
    onError: (e: any) => setErr(e.message),
  });
  const status = useMutation({
    mutationFn: ({ id, s }: any) =>
      api(`/academic/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: s }) }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });
  const lock = useMutation({
    mutationFn: ({ id, unlock }: any) =>
      api(`/academic/${id}/${unlock ? 'unlock' : 'lock'}`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });
  const overlay = useMutation({
    mutationFn: ({ id, title }: any) =>
      api(`/academic/${id}/overlay`, { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });

  return (
    <div>
      <PageHeader
        title={t('academic.title')}
        subtitle={t('academic.subtitle')}
        action={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="mr-1 inline h-4 w-4" />
            {t('academic.newPlan')}
          </button>
        }
      />

      {err && <ErrorNote msg={err} />}

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k}
                className={k === kind ? 'btn-primary' : 'btn-neo'}
                onClick={() => setKind(k)}
              >
                {t(`academic.kind.${k}` as any) || k.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r: any) => {
              const locked = r.status === 'LOCKED';
              const canLock = isHo && !locked;
              const canOverlay = !r.unitId && locked && !isHo;
              return (
                <div className="card p-5" key={r.id}>
                  <div className="flex items-start justify-between gap-2">
                    <b className="min-w-0 flex-1">{r.title}</b>
                    <Badge tone={STATUS_TONE[r.status] ?? 'stone'}>{r.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">{r.description || '—'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-stone-500">
                    {!r.unitId && <span className="chip">HO master</span>}
                    {r.unitId && r.masterId && (
                      <span className="chip">{t('academic.overlay')}</span>
                    )}
                    <span className="chip">v{r.version ?? 1}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === 'DRAFT' && (
                      <button
                        className="btn-neo text-xs"
                        onClick={() => status.mutate({ id: r.id, s: 'APPROVED' })}
                      >
                        {t('academic.approve')}
                      </button>
                    )}
                    {canLock && (
                      <button
                        className="btn-neo text-xs"
                        onClick={() => lock.mutate({ id: r.id, unlock: false })}
                      >
                        <Lock className="mr-1 inline h-3.5 w-3.5" />
                        {t('academic.lock')}
                      </button>
                    )}
                    {locked && user!.role === 'FOUNDER' && (
                      <button
                        className="btn-neo text-xs"
                        onClick={() => lock.mutate({ id: r.id, unlock: true })}
                      >
                        <LockOpen className="mr-1 inline h-3.5 w-3.5" />
                        {t('academic.unlock')}
                      </button>
                    )}
                    {canOverlay && r.status === 'LOCKED' && (
                      <button
                        className="btn-neo text-xs"
                        title={t('academic.adaptHint')}
                        onClick={() => overlay.mutate({ id: r.id })}
                      >
                        <CopyPlus className="mr-1 inline h-3.5 w-3.5" />
                        {t('academic.adapt')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="card p-6 text-sm font-semibold text-stone-500">
                {t('academic.empty')}
              </div>
            )}
          </div>
        </div>
        <TodayPanel />
      </div>

      {open && (
        <Modal title={t('academic.newPlan')} onClose={() => setOpen(false)}>
          {err && <ErrorNote msg={err} />}
          <div className="space-y-3">
            <Field label={t('academic.titleField')}>
              <input
                className="input"
                maxLength={160}
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />
            </Field>
            <Field label={t('academic.description')}>
              <textarea
                className="input min-h-28"
                maxLength={4000}
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </Field>
            {(kind === 'CALENDAR' || kind === 'LOG_PLAN') && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('academic.start')}>
                  <input
                    type="date"
                    className="input"
                    value={f.startDate ?? ''}
                    onChange={(e) => setF({ ...f, startDate: e.target.value || undefined })}
                  />
                </Field>
                <Field label={t('academic.end')}>
                  <input
                    type="date"
                    className="input"
                    value={f.endDate ?? ''}
                    onChange={(e) => setF({ ...f, endDate: e.target.value || undefined })}
                  />
                </Field>
              </div>
            )}
            <button
              className="btn-primary w-full"
              disabled={save.isPending || f.title.trim().length < 2}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t('common.loading') : t('academic.saveDraft')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

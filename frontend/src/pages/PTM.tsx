import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, MessageSquare, Plus, Undo2 } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * PTM management.
 *
 * One card per meeting: the roll-up at the top answers "how many families
 * turned up", the slot board lets the office generate a timetable and book on
 * a parent's behalf over the phone, and the roster captures attendance plus the
 * teacher's notes for the signed physical form.
 */

const time = (d: string) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function SlotBoard({
  sessionId,
  students,
  onChanged,
}: {
  sessionId: string;
  students: { id: string; label: string }[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [count, setCount] = useState(12);
  const [minutes, setMinutes] = useState(15);
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['ptm-slots', sessionId],
    queryFn: () => api(`/ptm/${sessionId}/slots`),
  });
  const generate = useMutation({
    mutationFn: () =>
      api(`/ptm/${sessionId}/slots`, {
        method: 'POST',
        body: JSON.stringify({ count, minutes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ptm-slots', sessionId] });
      onChanged();
    },
  });
  const book = useMutation({
    mutationFn: ({ slotId, studentId }: { slotId: string; studentId: string }) =>
      api(`/ptm/slots/${slotId}/book`, {
        method: 'POST',
        body: JSON.stringify({ studentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ptm-slots', sessionId] });
      onChanged();
    },
  });
  const release = useMutation({
    mutationFn: (slotId: string) =>
      api(`/ptm/slots/${slotId}/release`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ptm-slots', sessionId] });
      onChanged();
    },
  });

  const free = slots.filter((s: any) => !s.studentId).length;

  return (
    <div className="mt-4 rounded-2xl bg-white/70 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
          {t('ptm.slots')}
        </div>
        <span className="chip">
          {free} {t('ptm.free')} / {slots.length}
        </span>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-bold text-stone-500">
            {t('ptm.count')}
            <input
              className="input !ml-1 !w-16 !px-2 !py-1"
              type="number"
              min={1}
              max={60}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <label className="text-[11px] font-bold text-stone-500">
            {t('ptm.minutes')}
            <input
              className="input !ml-1 !w-16 !px-2 !py-1"
              type="number"
              min={5}
              max={60}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button
            className="btn-primary !px-3 !py-1.5 text-[11.5px]"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? t('common.loading') : t('ptm.generate')}
          </button>
        </div>
      </div>
      {isLoading ? (
        <p className="mt-3 text-xs text-stone-500">{t('common.loading')}</p>
      ) : slots.length === 0 ? (
        <p className="mt-3 text-xs text-stone-500">{t('ptm.noSlots')}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((s: any) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold',
                s.studentId ? 'bg-amber-100 text-amber-900' : 'bg-white text-stone-600',
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span className="tabular-nums">
                {time(s.startTime)}–{time(s.endTime)}
              </span>
              {s.studentId ? (
                <>
                  <span className="truncate">{t('ptm.booked')}</span>
                  <button
                    className="ml-auto text-stone-500 hover:text-rose-600"
                    title={t('ptm.release')}
                    aria-label={t('ptm.release')}
                    onClick={() => release.mutate(s.id)}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <select
                  className="input !ml-auto !w-32 !px-2 !py-1 text-[11px]"
                  aria-label={`${t('ptm.bookFor')} ${time(s.startTime)}`}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) book.mutate({ slotId: s.id, studentId: e.target.value });
                  }}
                >
                  <option value="">{t('ptm.bookFor')}…</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}
      <ErrorNote
        msg={
          (generate.error as Error)?.message ||
          (release.error as Error)?.message ||
          (book.error as Error)?.message
        }
      />
    </div>
  );
}

function NotesModal({
  record,
  onClose,
  onSaved,
}: {
  record: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [parentNames, setParentNames] = useState(record.parentNames ?? '');
  const [teacherNotes, setTeacherNotes] = useState(record.teacherNotes ?? '');
  const save = useMutation({
    mutationFn: () =>
      api(`/ptm/record/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ parentNames, teacherNotes }),
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal title={`${record.student.firstName} ${record.student.lastName}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('ptm.parentNames')}>
          <input
            className="input"
            value={parentNames}
            maxLength={200}
            onChange={(e) => setParentNames(e.target.value)}
            placeholder="Mr & Mrs Patel"
          />
        </Field>
        <Field label={t('ptm.teacherNotes')} hint={t('ptm.notesHint')}>
          <textarea
            className="input min-h-28"
            value={teacherNotes}
            maxLength={2000}
            onChange={(e) => setTeacherNotes(e.target.value)}
          />
        </Field>
        <ErrorNote msg={(save.error as Error)?.message} />
        <div className="flex justify-end gap-2">
          <button className="btn-neo" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Student-wise view. The roster answers "who came to this meeting"; a parent or
 * teacher on the phone usually asks the opposite question — "what has happened
 * for this child so far". This modal answers that from one endpoint
 * (`GET /ptm/student/:id`).
 */
function StudentHistory({ student, onClose }: { student: any; onClose: () => void }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['ptm-student', student.id],
    queryFn: () => api(`/ptm/student/${student.id}`),
  });
  const meetings: any[] = data?.meetings ?? [];
  return (
    <Modal
      title={`${student.firstName} ${student.lastName} · ${t('ptm.history')}`}
      onClose={onClose}
    >
      {isLoading && (
        <div className="text-sm font-semibold text-stone-500">{t('common.loading')}</div>
      )}
      {!isLoading && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">{student.admissionNo}</span>
            <span className="chip">
              {data?.stats?.attended ?? 0}/{data?.stats?.invited ?? 0} {t('ptm.invited')}
            </span>
            <span className="chip">
              {data?.upcomingSlot
                ? `${t('ptm.upcomingSlot')} · ${time(data.upcomingSlot.startTime)}`
                : t('ptm.noUpcomingSlot')}
            </span>
          </div>
          {meetings.length === 0 && (
            <div className="rounded-xl bg-white/60 p-4 text-sm font-semibold text-stone-500">
              {t('ptm.historyEmpty')}
            </div>
          )}
          {meetings.map((m) => (
            <div className="rounded-xl bg-white/60 p-3" key={m.id}>
              <div className="flex flex-wrap items-center gap-2">
                <b className="flex-1 truncate text-sm">{m.title}</b>
                <Badge tone={m.attended ? 'green' : 'honey'}>
                  {m.attended ? t('ptm.attended') : t('ptm.markAttended')}
                </Badge>
              </div>
              <div className="mt-1 text-[12px] font-semibold text-stone-500">
                {fmtDate(m.scheduledAt)}
                {m.slot ? ` · ${time(m.slot.startTime)}–${time(m.slot.endTime)}` : ''}
                {m.signedFormUrl ? ` · ${t('ptm.signedForm')}` : ''}
              </div>
              {(m.teacherNotes || m.parentNames) && (
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-stone-700">
                  {m.teacherNotes || m.parentNames}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function PTM() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ title: '', scheduledAt: '' });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<any>(null);
  const [historyFor, setHistoryFor] = useState<any>(null);

  const { data: rows = [] } = useQuery({ queryKey: ['ptm'], queryFn: () => api('/ptm') });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['ptm'] });
  };

  const save = useMutation({
    mutationFn: () => api('/ptm', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setF({ title: '', scheduledAt: '' });
    },
  });
  const mark = useMutation({
    mutationFn: ({ id, attended }: any) =>
      api(`/ptm/record/${id}`, { method: 'PATCH', body: JSON.stringify({ attended }) }),
    onSuccess: refresh,
  });

  return (
    <div>
      <PageHeader
        title={t('ptm.title')}
        subtitle={t('ptm.subtitle')}
        action={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="mr-1 inline h-4 w-4" />
            {t('ptm.schedule')}
          </button>
        }
      />
      {rows.length === 0 && (
        <div className="card p-6 text-sm font-semibold text-stone-500">{t('ptm.empty')}</div>
      )}
      {rows.map((s: any) => {
        const attended = s.records.filter((r: any) => r.attended).length;
        const pct = s.records.length ? Math.round((attended / s.records.length) * 100) : 0;
        const isOpen = expanded === s.id;
        return (
          <div className="card mb-4 p-5" key={s.id}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <b className="font-heading text-[15px]">{s.title}</b>
                <div className="text-[12px] font-semibold text-stone-500">
                  {fmtDate(s.scheduledAt)} · {time(s.scheduledAt)}
                </div>
              </div>
              <Badge tone={pct >= 75 ? 'green' : pct >= 40 ? 'honey' : 'red'}>{pct}%</Badge>
              <span className="chip">
                {attended}/{s.records.length} {t('ptm.families')}
              </span>
              <button
                className="btn-neo !px-3 !py-1.5 text-[11.5px]"
                onClick={() => setExpanded(isOpen ? null : s.id)}
              >
                <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                {isOpen ? t('ptm.hideSlots') : t('ptm.slots')}
              </button>
            </div>

            {isOpen && (
              <SlotBoard
                sessionId={s.id}
                students={s.records.map((r: any) => ({
                  id: r.studentId,
                  label: `${r.student.firstName} ${r.student.admissionNo}`,
                }))}
                onChanged={refresh}
              />
            )}

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {s.records.map((r: any) => (
                <div className="flex items-center gap-2 rounded-xl bg-white/60 p-3" key={r.id}>
                  <button
                    className="min-w-0 flex-1 text-left"
                    title={t('ptm.history')}
                    onClick={() => setHistoryFor(r.student)}
                  >
                    <b className="block truncate text-sm">
                      {r.student.firstName} {r.student.lastName}
                    </b>
                    <div className="text-xs text-stone-500">{r.student.admissionNo}</div>
                  </button>
                  <button
                    className="btn-neo !px-2.5 !py-1.5"
                    title={t('ptm.notes')}
                    aria-label={`${t('ptm.notes')} — ${r.student.firstName}`}
                    onClick={() => setNotesFor(r)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className={r.attended ? 'btn-primary' : 'btn-neo'}
                    onClick={() => mark.mutate({ id: r.id, attended: !r.attended })}
                  >
                    {r.attended ? (
                      <>
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                        {t('ptm.attended')}
                      </>
                    ) : (
                      t('ptm.markAttended')
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {notesFor && (
        <NotesModal record={notesFor} onClose={() => setNotesFor(null)} onSaved={refresh} />
      )}

      {historyFor && <StudentHistory student={historyFor} onClose={() => setHistoryFor(null)} />}

      {open && (
        <Modal title={t('ptm.schedule')} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Field label={t('ptm.meetingTitle')}>
              <input
                className="input"
                value={f.title}
                maxLength={120}
                onChange={(e) => setF({ ...f, title: e.target.value })}
              />
            </Field>
            <Field label={t('ptm.dateTime')}>
              <input
                type="datetime-local"
                className="input"
                value={f.scheduledAt}
                onChange={(e) => setF({ ...f, scheduledAt: e.target.value })}
              />
            </Field>
            <ErrorNote msg={(save.error as Error)?.message} />
            <button
              className="btn-primary w-full"
              disabled={save.isPending || !f.title || !f.scheduledAt}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t('common.loading') : t('ptm.create')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

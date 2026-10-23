import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Field, ErrorNote } from './ui/Modal';
import { useI18n, useLabels } from '../lib/i18n';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/auth';

const KINDS = ['BIRTH_CERT', 'AADHAAR', 'PHOTO', 'MEDICAL', 'REPORT_CARD', 'PTM_FORM', 'OTHER'];

/**
 * A child's documents.
 *
 * Files are stored per student and **never expire** — an admin deletes them by
 * hand when they are no longer needed (the API keeps the row as an audit trail).
 * Deliberately no "select all, delete" here: one file at a time, with a reason.
 */
export function StudentDocuments({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const L = useLabels();
  const { user } = useAuth();
  // Mirrors the API rule: only Head Office and the Centre Head may delete.
  const canDelete = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'].includes(user?.role ?? '');
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState('BIRTH_CERT');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ['student-docs', studentId],
    queryFn: () => api(`/students/${studentId}/documents`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['student-docs', studentId] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      return api(`/students/${studentId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          kind,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          contentBase64,
          ...(note ? { notes: note } : {}),
        }),
      });
    },
    onSuccess: () => {
      refresh();
      setNote('');
      setErr('');
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => setErr(e.message),
    onSettled: () => setBusy(false),
  });

  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/students/${studentId}/documents/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });

  const open = useMutation({
    mutationFn: (id: string) => api(`/students/${studentId}/documents/${id}/file`),
    onSuccess: (res: any) => {
      const bytes = atob(res.base64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([buf], { type: res.mimeType }));
      window.open(url, '_blank');
    },
    onError: (e: any) => setErr(e.message),
  });

  const rows = (data?.rows ?? []) as any[];

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-[color:var(--line)] p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={L('Document type')}>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Note')} hint={L('Optional — why this file is here')}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="mt-2 block w-full text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            upload.mutate(file);
          }}
        />
        <p className="mt-1 text-[10px] font-semibold text-stone-400">
          {L('PDF or photo, up to 10 MB. Files stay until an admin deletes them.')}
        </p>
      </div>

      <ErrorNote msg={err} />

      {!rows.length ? (
        <p className="py-4 text-center text-xs text-[color:var(--txt3)]">{t('docs.empty')}</p>
      ) : (
        <div className="divide-y divide-[color:var(--line)] rounded-xl border border-[color:var(--line)]">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => open.mutate(r.id)}
                title={L('Open')}
              >
                <div className="truncate text-xs font-bold">{r.fileName}</div>
                <div className="text-[10px] font-semibold text-stone-400">
                  {r.kind.replace(/_/g, ' ').toLowerCase()} · {Math.round(r.sizeBytes / 1024)} KB
                </div>
              </button>
              <button
                className={cn('text-rose-600', !canDelete && 'invisible')}
                title={t('docs.deleteHint')}
                onClick={() => {
                  const reason = window.prompt(t('docs.deleteReason'));
                  if (reason === null) return;
                  remove.mutate({ id: r.id, reason });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

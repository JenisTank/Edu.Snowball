import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { DataTable } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { useI18n, useLabels } from '../lib/i18n';
import { useAuth, HO_ROLES } from '../lib/auth';
import { inr } from '../lib/utils';

const PURPOSES = ['PARENT_VISIT', 'ADMISSION_ENQUIRY', 'VENDOR', 'INTERVIEW', 'OFFICIAL', 'OTHER'];

/**
 * Front desk.
 *
 * Two registers reception keeps on paper today: the visitor book (who is in the
 * building right now — a safeguarding and fire-safety record) and the security
 * deposit register (money the centre holds but does not own).
 */
export default function FrontDesk() {
  const { t } = useI18n();
  const L = useLabels();
  const qc = useQueryClient();
  const { user } = useAuth();
  // A Head Office account has no unit of its own, so the desk has to pick one.
  const isHO = HO_ROLES.includes(user?.role ?? '');
  const [unitId, setUnitId] = useState(user?.unitId ?? '');
  const [tab, setTab] = useState<'guests' | 'deposits'>('guests');
  const [guestOpen, setGuestOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [closeId, setCloseId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const { data: units = [] } = useQuery({
    queryKey: ['fd-units'],
    queryFn: () => api('/units'),
    enabled: isHO,
  });
  const scope = isHO && unitId ? `?unitId=${unitId}` : '';
  const { data: guests } = useQuery({
    queryKey: ['fd-guests', unitId],
    queryFn: () => api(`/frontdesk/guests${scope}`),
  });
  const { data: deposits } = useQuery({
    queryKey: ['fd-deposits', unitId],
    queryFn: () => api(`/frontdesk/deposits${scope}`),
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['fd-employees'],
    queryFn: () => api('/hr/employees').catch(() => []),
    enabled: depositOpen,
  });

  const [guest, setGuest] = useState<any>({
    guestName: '',
    phone: '',
    organisation: '',
    purpose: 'PARENT_VISIT',
    hostName: '',
    badgeNo: '',
    notes: '',
  });
  const [deposit, setDeposit] = useState<any>({
    holder: 'EMPLOYEE',
    holderId: '',
    amount: '',
    notes: '',
  });
  const [closing, setClosing] = useState<any>({ outcome: 'RETURNED', reason: '', amount: '' });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['fd-guests', unitId] });
    qc.invalidateQueries({ queryKey: ['fd-deposits', unitId] });
  };

  const checkIn = useMutation({
    mutationFn: () =>
      api('/frontdesk/guests', {
        method: 'POST',
        body: JSON.stringify({
          ...guest,
          ...(isHO && unitId ? { unitId } : {}),
          phone: guest.phone || undefined,
          organisation: guest.organisation || undefined,
          hostName: guest.hostName || undefined,
          badgeNo: guest.badgeNo || undefined,
          notes: guest.notes || undefined,
        }),
      }),
    onSuccess: () => {
      refresh();
      setGuestOpen(false);
      setGuest({
        guestName: '',
        phone: '',
        organisation: '',
        purpose: 'PARENT_VISIT',
        hostName: '',
        badgeNo: '',
        notes: '',
      });
      setErr('');
    },
    onError: (e: any) => setErr(e.message),
  });

  const checkOut = useMutation({
    mutationFn: (id: string) =>
      api(`/frontdesk/guests/${id}/checkout`, { method: 'POST', body: '{}' }),
    onSuccess: refresh,
  });

  const saveDeposit = useMutation({
    mutationFn: () =>
      api('/frontdesk/deposits', {
        method: 'POST',
        body: JSON.stringify({
          holder: deposit.holder,
          holderId: deposit.holderId,
          amount: Number(deposit.amount),
          notes: deposit.notes || undefined,
        }),
      }),
    onSuccess: () => {
      refresh();
      setDepositOpen(false);
      setDeposit({ holder: 'EMPLOYEE', holderId: '', amount: '', notes: '' });
      setErr('');
    },
    onError: (e: any) => setErr(e.message),
  });

  const closeDeposit = useMutation({
    mutationFn: () =>
      api(`/frontdesk/deposits/${closeId}/close`, {
        method: 'PATCH',
        body: JSON.stringify({
          outcome: closing.outcome,
          reason: closing.reason,
          ...(closing.amount ? { amount: Number(closing.amount) } : {}),
        }),
      }),
    onSuccess: () => {
      refresh();
      setCloseId(null);
      setErr('');
    },
    onError: (e: any) => setErr(e.message),
  });

  const guestRows = guests?.rows ?? [];
  const inside = guestRows.filter((g: any) => !g.outAt).length;
  const overdue = guestRows.filter((g: any) => !g.outAt && g.minutesInside > 240).length;

  return (
    <div>
      <PageHeader
        title={t('fd.title')}
        subtitle={t('fd.subtitle')}
        action={
          <div className="flex items-center gap-2">
            {isHO && (
              <select
                className="input h-9 w-auto"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                <option value="">{t('fd.allUnits')}</option>
                {(units as any[]).map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </select>
            )}
            <button className="btn-secondary" onClick={() => setDepositOpen(true)}>
              <ShieldCheck className="mr-1 inline h-4 w-4" />
              {t('fd.newDeposit')}
            </button>
            <button className="btn-primary" onClick={() => setGuestOpen(true)}>
              <UserPlus className="mr-1 inline h-4 w-4" />
              {t('fd.checkIn')}
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
            {t('fd.insideNow')}
          </div>
          <div className="font-heading text-3xl font-black">{inside}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
            {t('fd.overdueVisits')}
          </div>
          <div className={`font-heading text-3xl font-black ${overdue ? 'text-rose-600' : ''}`}>
            {overdue}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
            {t('fd.depositsHeld')}
          </div>
          <div className="font-heading text-3xl font-black">{inr(deposits?.totals?.held ?? 0)}</div>
          <div className="text-[10px] font-semibold text-stone-400">
            {deposits?.totals?.count ?? 0} {t('fd.openDeposits')}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(['guests', 'deposits'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${
              tab === k ? 'bg-[color:var(--accent)] text-white' : 'bg-white text-stone-600'
            }`}
          >
            {k === 'guests' ? t('fd.visitorBook') : t('fd.deposits')}
          </button>
        ))}
      </div>

      {tab === 'guests' ? (
        <DataTable
          title={L('Visitor book')}
          data={guestRows}
          exportName="guest-log"
          columns={[
            { id: 'guestName', header: L('Guest'), accessorKey: 'guestName' },
            {
              id: 'purpose',
              header: L('Purpose'),
              accessorKey: 'purpose',
              cell: (c: any) => String(c.getValue()).replace(/_/g, ' ').toLowerCase(),
            },
            { id: 'hostName', header: L('Meeting'), accessorKey: 'hostName' },
            { id: 'badgeNo', header: L('Badge'), accessorKey: 'badgeNo' },
            {
              id: 'inAt',
              header: L('In'),
              accessorKey: 'inAt',
              cell: (c: any) =>
                new Date(c.getValue()).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
            },
            {
              id: 'status',
              header: L('Status'),
              accessorKey: 'outAt',
              cell: (c: any) => {
                const row = c.row.original;
                if (row.outAt)
                  return (
                    <span className="chip">
                      out{' '}
                      {new Date(row.outAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  );
                return (
                  <span className={row.minutesInside > 240 ? 'chip text-rose-600' : 'chip'}>
                    in · {row.minutesInside} min
                  </span>
                );
              },
            },
            {
              id: 'actions',
              header: '',
              cell: (c: any) =>
                c.row.original.outAt ? null : (
                  <button
                    className="text-[11px] font-bold text-[color:var(--accent)]"
                    onClick={() => checkOut.mutate(c.row.original.id)}
                  >
                    <LogOut className="mr-1 inline h-3.5 w-3.5" />
                    {t('fd.checkOut')}
                  </button>
                ),
            },
          ]}
        />
      ) : (
        <DataTable
          title={L('Security deposits')}
          data={deposits?.rows ?? []}
          exportName="security-deposits"
          columns={[
            {
              id: 'holder',
              header: L('Holder'),
              accessorFn: (r: any) => r.holder?.name ?? '—',
              cell: (c: any) => (
                <div>
                  <div className="font-semibold">{c.row.original.holder?.name}</div>
                  <div className="text-[11px] text-stone-500">
                    {c.row.original.holder?.ref} · {c.row.original.holder?.type.toLowerCase()}
                  </div>
                </div>
              ),
            },
            {
              id: 'amount',
              header: L('Amount'),
              accessorKey: 'amount',
              cell: (c: any) => inr(Number(c.getValue())),
            },
            { id: 'status', header: L('Status'), accessorKey: 'status' },
            {
              id: 'collectedAt',
              header: L('Collected'),
              accessorKey: 'collectedAt',
              cell: (c: any) =>
                c.getValue() ? new Date(c.getValue()).toLocaleDateString('en-IN') : '—',
            },
            { id: 'reason', header: L('Reason'), accessorKey: 'reason' },
            {
              id: 'actions',
              header: '',
              cell: (c: any) =>
                c.row.original.status === 'HELD' ? (
                  <button
                    className="text-[11px] font-bold text-[color:var(--accent)]"
                    onClick={() => {
                      setCloseId(c.row.original.id);
                      setClosing({ outcome: 'RETURNED', reason: '', amount: '' });
                    }}
                  >
                    {t('fd.closeDeposit')}
                  </button>
                ) : null,
            },
          ]}
        />
      )}

      {guestOpen && (
        <Modal title={t('fd.checkIn')} onClose={() => setGuestOpen(false)}>
          <div className="grid gap-3">
            <Field label={t('fd.guestName')}>
              <input
                className="input"
                value={guest.guestName}
                onChange={(e) => setGuest({ ...guest, guestName: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fd.phone')}>
                <input
                  className="input"
                  value={guest.phone}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                />
              </Field>
              <Field label={t('fd.purpose')}>
                <select
                  className="input"
                  value={guest.purpose}
                  onChange={(e) => setGuest({ ...guest, purpose: e.target.value })}
                >
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fd.meeting')}>
                <input
                  className="input"
                  value={guest.hostName}
                  onChange={(e) => setGuest({ ...guest, hostName: e.target.value })}
                />
              </Field>
              <Field label={t('fd.badge')}>
                <input
                  className="input"
                  value={guest.badgeNo}
                  onChange={(e) => setGuest({ ...guest, badgeNo: e.target.value })}
                />
              </Field>
            </div>
            <ErrorNote msg={err} />
            <button
              className="btn-primary"
              disabled={checkIn.isPending || !guest.guestName.trim()}
              onClick={() => checkIn.mutate()}
            >
              {t('fd.checkIn')}
            </button>
          </div>
        </Modal>
      )}

      {depositOpen && (
        <Modal title={t('fd.newDeposit')} onClose={() => setDepositOpen(false)}>
          <div className="grid gap-3">
            <Field label={t('fd.holder')} hint={t('fd.oneDeposit')}>
              <select
                className="input"
                value={deposit.holder}
                onChange={(e) => setDeposit({ ...deposit, holder: e.target.value, holderId: '' })}
              >
                <option value="EMPLOYEE">{t('fd.staffMember')}</option>
                <option value="STUDENT">{t('fd.child')}</option>
              </select>
            </Field>
            {deposit.holder === 'EMPLOYEE' && (
              <Field label={t('fd.staffMember')}>
                <select
                  className="input"
                  value={deposit.holderId}
                  onChange={(e) => setDeposit({ ...deposit, holderId: e.target.value })}
                >
                  <option value="">—</option>
                  {(employees as any[]).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.employeeNo} · {e.fullName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t('fd.amount')}>
              <input
                className="input"
                inputMode="decimal"
                value={deposit.amount}
                onChange={(e) =>
                  setDeposit({ ...deposit, amount: e.target.value.replace(/[^0-9.]/g, '') })
                }
              />
            </Field>
            <Field label={t('fd.notes')}>
              <input
                className="input"
                value={deposit.notes}
                onChange={(e) => setDeposit({ ...deposit, notes: e.target.value })}
              />
            </Field>
            <ErrorNote msg={err} />
            <button
              className="btn-primary"
              disabled={saveDeposit.isPending || !deposit.holderId || !(Number(deposit.amount) > 0)}
              onClick={() => saveDeposit.mutate()}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              {t('fd.newDeposit')}
            </button>
          </div>
        </Modal>
      )}

      {closeId && (
        <Modal title={t('fd.closeDeposit')} onClose={() => setCloseId(null)}>
          <div className="grid gap-3">
            <Field label={t('fd.outcome')}>
              <select
                className="input"
                value={closing.outcome}
                onChange={(e) => setClosing({ ...closing, outcome: e.target.value })}
              >
                <option value="RETURNED">{t('fd.returned')}</option>
                <option value="FORFEITED">{t('fd.forfeited')}</option>
              </select>
            </Field>
            {closing.outcome === 'FORFEITED' && (
              <Field label={t('fd.forfeitAmount')} hint={t('fd.forfeitHint')}>
                <input
                  className="input"
                  inputMode="decimal"
                  value={closing.amount}
                  onChange={(e) =>
                    setClosing({ ...closing, amount: e.target.value.replace(/[^0-9.]/g, '') })
                  }
                />
              </Field>
            )}
            <Field label={t('fd.reason')}>
              <input
                className="input"
                value={closing.reason}
                onChange={(e) => setClosing({ ...closing, reason: e.target.value })}
              />
            </Field>
            <ErrorNote msg={err} />
            <button
              className="btn-primary"
              disabled={closeDeposit.isPending || !closing.reason.trim()}
              onClick={() => closeDeposit.mutate()}
            >
              {t('fd.closeDeposit')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

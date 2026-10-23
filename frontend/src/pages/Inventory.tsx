import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, PackageCheck, Plus, Truck, Wallet } from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { PageHeader } from '../components/layout/AppLayout';
import { Badge } from '../components/ui/DataTable';
import { Modal, Field, ErrorNote } from '../components/ui/Modal';
import { cn } from '../lib/utils';
import { useI18n, useLabels } from '../lib/i18n';

// ═══════════════════════════════════════════════════════════════════
// Inventory — stock, procurement (PRF → PO → GRN), petty cash, reports.
// ═══════════════════════════════════════════════════════════════════

const inr = (n: any) => '₹' + Number(n || 0).toLocaleString('en-IN');
const day = (d: any) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

const TABS = ['stock', 'reorder', 'procurement', 'petty-cash', 'reports'] as const;
type Tab = (typeof TABS)[number];

export default function Inventory() {
  const L = useLabels();
  const { t: tr } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('stock');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({
    sku: '',
    name: '',
    category: 'ACADEMIC',
    reorderLevel: 5,
    unitCost: 0,
  });

  const { data: cats = [] } = useQuery({
    queryKey: ['inv-cats'],
    queryFn: () => api('/inventory/categories'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api('/inventory'),
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ['inv-low'],
    queryFn: () => api('/procurement/reports/low-stock'),
  });

  const save = useMutation({
    mutationFn: () => api('/inventory', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inv-low'] });
      setOpen(false);
    },
  });

  const low = rows.filter((r: any) => r.quantity <= r.reorderLevel);
  const value = rows.reduce((s: number, r: any) => s + r.quantity * Number(r.unitCost), 0);

  return (
    <div>
      <PageHeader
        title={tr('inventory.title')}
        subtitle={tr('inventory.subtitle')}
        count={`${rows.length} SKUs`}
        action={
          <div className="flex items-center gap-2">
            <div className="seg">
              {TABS.map((t) => (
                <button
                  key={t}
                  className={cn('seg-item', tab === t && 'seg-item-active')}
                  onClick={() => setTab(t)}
                >
                  {t === 'reorder' ? L('Reorder') : t.replace('-', ' ')}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="mr-1 inline h-4 w-4" />
              {tr('inventory.newSku')}
            </button>
          </div>
        }
      />

      {tab === 'stock' && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--txt3)]">
                Stock value
              </div>
              <div className="mt-1 text-2xl font-extrabold">{inr(value)}</div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--txt3)]">
                Low stock
              </div>
              <div
                className={cn(
                  'mt-1 text-2xl font-extrabold',
                  low.length ? 'text-rose-600' : 'text-emerald-700',
                )}
              >
                {low.length}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--txt3)]">
                Reorder suggested
              </div>
              <div className="mt-1 text-2xl font-extrabold">
                {(lowStock?.rows ?? lowStock?.items ?? []).reduce(
                  (s: number, r: any) => s + (r.suggestedQty ?? 0),
                  0,
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {rows.map((r: any) => (
              <div className="card p-5" key={r.id}>
                <div className="flex justify-between gap-2">
                  <b className="text-[13px]">{r.name}</b>
                  <span className="chip">{r.sku}</span>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {String(r.category).replace(/_/g, ' ')}
                </p>
                <div
                  className={`mt-4 text-3xl font-extrabold ${r.quantity <= r.reorderLevel ? 'text-rose-600' : 'text-emerald-700'}`}
                >
                  {r.quantity}
                </div>
                <span className="text-xs font-semibold text-stone-500">
                  in stock · reorder at {r.reorderLevel} · {inr(r.unitCost)} each
                </span>
                {r.quantity <= r.reorderLevel && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Reorder
                  </div>
                )}
              </div>
            ))}
            {!rows.length && (
              <div className="card col-span-full p-10 text-center text-[13px] font-semibold text-[color:var(--txt3)]">
                No SKUs yet — add the first one.
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'reorder' && <ReorderTab />}
      {tab === 'procurement' && <Procurement items={rows} />}
      {tab === 'petty-cash' && <PettyCash />}
      {tab === 'reports' && <Reports />}

      {open && (
        <Modal title={L('Create inventory SKU')} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Field label="SKU">
              <input
                className="input"
                value={f.sku}
                onChange={(e) => setF({ ...f, sku: e.target.value })}
              />
            </Field>
            <Field label="Name">
              <input
                className="input"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={f.category}
                onChange={(e) => setF({ ...f, category: e.target.value })}
              >
                {cats.map((c: string) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reorder level">
                <input
                  type="number"
                  className="input"
                  value={f.reorderLevel}
                  onChange={(e) => setF({ ...f, reorderLevel: e.target.value })}
                />
              </Field>
              <Field label="Unit cost">
                <input
                  type="number"
                  className="input"
                  value={f.unitCost}
                  onChange={(e) => setF({ ...f, unitCost: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <ErrorNote msg={(save.error as any)?.message} />
          <button className="btn-primary mt-4 w-full" onClick={() => save.mutate()}>
            Create SKU
          </button>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────── procurement ───────────────────────────
function Procurement({ items }: { items: any[] }) {
  const L = useLabels();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [vendor, setVendor] = useState<any>({
    name: '',
    code: '',
    phone: '',
    category: 'ACADEMIC',
  });
  const [request, setRequest] = useState<any>({
    title: '',
    justification: '',
    lines: [{ description: '', quantity: 1, estimatedCost: 0 }],
  });
  const [order, setOrder] = useState<any>({ vendorId: '', requestId: '', expectedAt: '' });
  const [receiving, setReceiving] = useState<any>(null);
  const [receiveLines, setReceiveLines] = useState<any[]>([]);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => api('/procurement/vendors'),
  });
  const { data: requests = [] } = useQuery({
    queryKey: ['prf'],
    queryFn: () => api('/procurement/requests'),
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['po'],
    queryFn: () => api('/procurement/orders'),
  });

  const invalidate = () => {
    ['vendors', 'prf', 'po', 'inventory', 'inv-low'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };

  const addVendor = useMutation({
    mutationFn: () => api('/procurement/vendors', { method: 'POST', body: JSON.stringify(vendor) }),
    onSuccess: () => {
      setVendor({ name: '', code: '', phone: '', category: 'ACADEMIC' });
      invalidate();
    },
    onError: (e: any) => setErr(e.message),
  });
  const addRequest = useMutation({
    mutationFn: () =>
      api('/procurement/requests', {
        method: 'POST',
        body: JSON.stringify({
          ...request,
          lines: request.lines.filter((l: any) => l.description.trim()),
        }),
      }),
    onSuccess: () => {
      setRequest({
        title: '',
        justification: '',
        lines: [{ description: '', quantity: 1, estimatedCost: 0 }],
      });
      invalidate();
    },
    onError: (e: any) => setErr(e.message),
  });
  const submitRequest = useMutation({
    mutationFn: (id: string) =>
      api(`/procurement/requests/${id}/submit`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
    onError: (e: any) => setErr(e.message),
  });
  const decideRequest = useMutation({
    mutationFn: ({ id, kind }: any) =>
      api(`/procurement/requests/${id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ note: kind === 'approve' ? 'Approved' : 'Rejected by approver' }),
      }),
    onSuccess: invalidate,
    onError: (e: any) => setErr(e.message),
  });
  const addOrder = useMutation({
    mutationFn: () => api('/procurement/orders', { method: 'POST', body: JSON.stringify(order) }),
    onSuccess: () => {
      setOrder({ vendorId: '', requestId: '', expectedAt: '' });
      invalidate();
    },
    onError: (e: any) => setErr(e.message),
  });
  const sendOrder = useMutation({
    mutationFn: (id: string) =>
      api(`/procurement/orders/${id}/send`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
    onError: (e: any) => setErr(e.message),
  });
  const receive = useMutation({
    mutationFn: () =>
      api(`/procurement/orders/${receiving.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ lines: receiveLines }),
      }),
    onSuccess: () => {
      setReceiving(null);
      setReceiveLines([]);
      invalidate();
    },
    onError: (e: any) => setErr(e.message),
  });

  const approved = requests.filter((r: any) => r.status === 'APPROVED');

  return (
    <div className="space-y-4">
      <ErrorNote msg={err} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* vendors */}
        <section className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <b className="text-[13px]">Vendors</b>
            <span className="chip">{vendors.length}</span>
          </div>
          <div className="max-h-[180px] space-y-1.5 overflow-auto">
            {vendors.map((v: any) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg bg-[color:var(--surface2)] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-bold">{v.name}</div>
                  <div className="text-[10.5px] text-[color:var(--txt3)]">
                    {v.code} · {v.category ?? 'general'} {v.phone ? `· ${v.phone}` : ''}
                  </div>
                </div>
                {v.preApproved && <Badge tone="green">pre-approved</Badge>}
              </div>
            ))}
            {!vendors.length && (
              <div className="py-4 text-center text-[12px] text-[color:var(--txt3)]">
                No vendors yet.
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder={L('Vendor name')}
              value={vendor.name}
              onChange={(e) => setVendor({ ...vendor, name: e.target.value })}
            />
            <input
              className="input"
              placeholder={L('Code (VND-01)')}
              value={vendor.code}
              onChange={(e) => setVendor({ ...vendor, code: e.target.value })}
            />
            <input
              className="input"
              placeholder={L('Phone')}
              value={vendor.phone}
              onChange={(e) => setVendor({ ...vendor, phone: e.target.value })}
            />
            <select
              className="input"
              value={vendor.category}
              onChange={(e) => setVendor({ ...vendor, category: e.target.value })}
            >
              {[
                'ACADEMIC',
                'ART_CRAFT',
                'OFFICE',
                'HOUSEKEEPING',
                'MAINTENANCE',
                'IT_ELECTRONICS',
                'STUDENT_INVENTORY',
                'SAFETY',
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              className="btn-neo col-span-2"
              disabled={!vendor.name || !vendor.code}
              onClick={() => addVendor.mutate()}
            >
              Add vendor
            </button>
          </div>
        </section>

        {/* purchase request */}
        <section className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <PackageCheck className="h-4 w-4" />
            <b className="text-[13px]">Purchase requests</b>
            <span className="chip">{requests.length}</span>
          </div>
          <div className="max-h-[180px] space-y-1.5 overflow-auto">
            {requests.map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-[color:var(--surface2)] px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold">{r.title}</div>
                  <div className="text-[10.5px] text-[color:var(--txt3)]">
                    {r.lines?.length ?? 0} lines ·{' '}
                    {r.lines
                      ?.reduce((s: number, l: any) => s + l.quantity * Number(l.estimatedCost), 0)
                      .toLocaleString('en-IN')}{' '}
                    est.
                  </div>
                </div>
                <Badge
                  tone={
                    r.status === 'APPROVED'
                      ? 'green'
                      : r.status === 'SUBMITTED'
                        ? 'honey'
                        : r.status === 'REJECTED'
                          ? 'red'
                          : 'stone'
                  }
                >
                  {r.status}
                </Badge>
                {r.status === 'DRAFT' && (
                  <button
                    className="btn-neo !px-2 !py-0.5 text-[11px]"
                    onClick={() => submitRequest.mutate(r.id)}
                  >
                    Submit
                  </button>
                )}
                {r.status === 'SUBMITTED' && (
                  <div className="flex gap-1">
                    <button
                      className="btn-neo !px-2 !py-0.5 text-[11px]"
                      onClick={() => decideRequest.mutate({ id: r.id, kind: 'approve' })}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-neo !px-2 !py-0.5 text-[11px]"
                      onClick={() => decideRequest.mutate({ id: r.id, kind: 'reject' })}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!requests.length && (
              <div className="py-4 text-center text-[12px] text-[color:var(--txt3)]">
                No requests yet.
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <input
              className="input"
              placeholder={L('What do you need? (e.g. Craft paper for K1)')}
              value={request.title}
              onChange={(e) => setRequest({ ...request, title: e.target.value })}
            />
            <div className="flex flex-wrap gap-2">
              {request.lines.map((l: any, i: number) => (
                <div key={i} className="flex flex-1 gap-1.5">
                  <input
                    className="input flex-1"
                    placeholder={L('Item')}
                    value={l.description}
                    onChange={(e) => {
                      const lines = [...request.lines];
                      lines[i] = { ...l, description: e.target.value };
                      setRequest({ ...request, lines });
                    }}
                  />
                  <input
                    type="number"
                    className="input !w-16"
                    value={l.quantity}
                    onChange={(e) => {
                      const lines = [...request.lines];
                      lines[i] = { ...l, quantity: Number(e.target.value) };
                      setRequest({ ...request, lines });
                    }}
                  />
                  <input
                    type="number"
                    className="input !w-20"
                    placeholder={L('Cost')}
                    value={l.estimatedCost}
                    onChange={(e) => {
                      const lines = [...request.lines];
                      lines[i] = { ...l, estimatedCost: Number(e.target.value) };
                      setRequest({ ...request, lines });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-neo text-[11.5px]"
                onClick={() =>
                  setRequest({
                    ...request,
                    lines: [...request.lines, { description: '', quantity: 1, estimatedCost: 0 }],
                  })
                }
              >
                + line
              </button>
              <button
                className="btn-primary flex-1"
                disabled={
                  !request.title.trim() || !request.lines.some((l: any) => l.description.trim())
                }
                onClick={() => addRequest.mutate()}
              >
                Raise request
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* purchase orders */}
      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <b className="text-[13px]">Purchase orders</b>
          <span className="chip">{orders.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="input !w-auto"
              value={order.requestId}
              onChange={(e) => setOrder({ ...order, requestId: e.target.value })}
            >
              <option value="">Raise ad-hoc PO…</option>
              {approved.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <select
              className="input !w-auto"
              value={order.vendorId}
              onChange={(e) => setOrder({ ...order, vendorId: e.target.value })}
            >
              <option value="">Vendor…</option>
              {vendors.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input !w-auto"
              value={order.expectedAt}
              onChange={(e) => setOrder({ ...order, expectedAt: e.target.value })}
            />
            <button
              className="btn-primary"
              disabled={!order.vendorId}
              onClick={() => addOrder.mutate()}
            >
              Create PO
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-[color:var(--txt3)]">
              <tr>
                <th className="px-2 py-1.5">PO</th>
                <th className="px-2 py-1.5">Vendor</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Lines</th>
                <th className="px-2 py-1.5 text-right">Value</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => {
                const open = (o.lines ?? []).some((l: any) => l.receivedQty < l.quantity);
                return (
                  <tr key={o.id} className="border-t border-[color:var(--line)]">
                    <td className="px-2 py-1.5 font-bold">{o.poNo}</td>
                    <td className="px-2 py-1.5">{o.vendor?.name}</td>
                    <td className="px-2 py-1.5">
                      <Badge
                        tone={
                          o.status === 'RECEIVED'
                            ? 'green'
                            : o.status === 'PARTIAL'
                              ? 'sky'
                              : o.status === 'CANCELLED'
                                ? 'red'
                                : 'stone'
                        }
                      >
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      {(o.lines ?? []).length} · received{' '}
                      {(o.lines ?? []).reduce((s: number, l: any) => s + l.receivedQty, 0)}/
                      {(o.lines ?? []).reduce((s: number, l: any) => s + l.quantity, 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right">{inr(o.totalAmount)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {o.status === 'DRAFT' && (
                        <button
                          className="btn-neo !px-2 !py-0.5 text-[11px]"
                          onClick={() => sendOrder.mutate(o.id)}
                        >
                          Send
                        </button>
                      )}
                      {['SENT', 'PARTIAL'].includes(o.status) && open && (
                        <button
                          className="btn-neo !px-2 !py-0.5 text-[11px]"
                          onClick={() => {
                            setErr('');
                            setReceiving(o);
                            setReceiveLines(
                              (o.lines ?? [])
                                .filter((l: any) => l.receivedQty < l.quantity)
                                .map((l: any) => ({
                                  orderLineId: l.id,
                                  itemId: l.itemId,
                                  description: l.description,
                                  quantity: l.quantity - l.receivedQty,
                                  unitCost: Number(l.unitCost),
                                })),
                            );
                          }}
                        >
                          Receive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!orders.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-[color:var(--txt3)]">
                    No purchase orders yet — approve a request, then raise a PO.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {receiving && (
        <Modal title={`Receive goods · ${receiving.poNo}`} onClose={() => setReceiving(null)}>
          <p className="mb-3 text-[12px] text-[color:var(--txt3)]">
            Stock only increases through this step — the GRN, the inventory movement and the PO
            status are written together.
          </p>
          <div className="space-y-2">
            {receiveLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px] items-center gap-2">
                <div>
                  <div className="text-[12.5px] font-bold">{l.description}</div>
                  <div className="text-[10.5px] text-[color:var(--txt3)]">
                    {l.itemId ? 'linked to stock' : '⚠ no stock item linked — cannot be received'}
                  </div>
                </div>
                <input
                  type="number"
                  className="input"
                  value={l.quantity}
                  onChange={(e) => {
                    const next = [...receiveLines];
                    next[i] = { ...l, quantity: Number(e.target.value) };
                    setReceiveLines(next);
                  }}
                />
              </div>
            ))}
          </div>
          <ErrorNote msg={err} />
          <button className="btn-primary mt-4 w-full" onClick={() => receive.mutate()}>
            <Download className="mr-1 inline h-4 w-4" />
            Post GRN
          </button>
        </Modal>
      )}

      <p className="text-[11px] text-[color:var(--txt3)]">
        {items.length} SKUs on the shelf · goods receipt is the only path that increases stock.
      </p>
    </div>
  );
}

// ─────────────────────────── petty cash ───────────────────────────
function PettyCash() {
  const L = useLabels();
  const qc = useQueryClient();
  const [f, setF] = useState<any>({ type: 'SPEND', amount: '', description: '', receiptRef: '' });
  const [err, setErr] = useState('');
  const { data } = useQuery({ queryKey: ['petty'], queryFn: () => api('/procurement/petty-cash') });
  const add = useMutation({
    mutationFn: () => api('/procurement/petty-cash', { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => {
      setF({ type: 'SPEND', amount: '', description: '', receiptRef: '' });
      qc.invalidateQueries({ queryKey: ['petty'] });
    },
    onError: (e: any) => setErr(e.message),
  });
  const balance = Number(data?.balance ?? 0);
  const float = Number(data?.float ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
          <b className="text-[13px]">Petty cash ledger</b>
          <Badge tone={balance < float * 0.2 ? 'red' : 'green'}>
            {inr(balance)} of {inr(float)}
          </Badge>
        </div>
        <div className="max-h-[420px] divide-y divide-[color:var(--line)] overflow-auto">
          {(data?.entries ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold">{e.description}</div>
                <div className="text-[10.5px] text-[color:var(--txt3)]">
                  {day(e.date)} · {e.type.toLowerCase()} {e.receiptRef ? `· ${e.receiptRef}` : ''}
                </div>
              </div>
              <b
                className={cn(
                  'text-[12.5px]',
                  e.type === 'SPEND' ? 'text-rose-600' : 'text-emerald-700',
                )}
              >
                {e.type === 'SPEND' ? '−' : '+'}
                {inr(e.amount)}
              </b>
            </div>
          ))}
          {!data?.entries?.length && (
            <div className="px-4 py-10 text-center text-[12.5px] text-[color:var(--txt3)]">
              No petty-cash entries yet.
            </div>
          )}
        </div>
      </section>
      <aside className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          <b className="text-[13px]">Record an entry</b>
        </div>
        <div className="space-y-2">
          <select
            className="input"
            value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value })}
          >
            {['SPEND', 'TOPUP', 'RETURN'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder={L('Amount')}
            type="number"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
          <input
            className="input"
            placeholder={L('What was it for?')}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
          <input
            className="input"
            placeholder={L('Bill / receipt no. (optional)')}
            value={f.receiptRef}
            onChange={(e) => setF({ ...f, receiptRef: e.target.value })}
          />
          <ErrorNote msg={err} />
          <button
            className="btn-primary w-full"
            disabled={!f.amount || !f.description.trim()}
            onClick={() => {
              setErr('');
              add.mutate();
            }}
          >
            Post entry
          </button>
          <p className="text-[11px] text-[color:var(--txt3)]">
            A spend can never take the float below zero. The float itself is a Head Office setting.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────── reports ───────────────────────────
function Reports() {
  const [keys, setKeys] = useState<any[]>([]);
  const [active, setActive] = useState('stock-on-hand');
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/procurement/reports')
      .then(setKeys)
      .catch(() => null);
  }, []);

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setResult(await api(`/procurement/reports/${active}`));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rows: any[] = result?.rows ?? [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="card p-3">
        {keys.map((k: any) => (
          <button
            key={k.key}
            onClick={() => {
              setActive(k.key);
              setResult(null);
            }}
            className={cn(
              'mb-0.5 block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold',
              active === k.key
                ? 'bg-[color:var(--accent)] text-white'
                : 'hover:bg-[color:var(--surface2)]',
            )}
          >
            {k.name}
          </button>
        ))}
      </aside>
      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run report'}
          </button>
          <button
            className="btn-neo"
            onClick={() =>
              downloadFile(`/procurement/reports/${active}?format=csv`, `${active}.csv`).catch(
                (e) => setErr(e.message),
              )
            }
          >
            <Download className="mr-1 inline h-4 w-4" /> CSV
          </button>
          <span className="chip">{rows.length} rows</span>
        </div>
        <ErrorNote msg={err} />
        <div className="overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[10.5px] uppercase tracking-wide text-[color:var(--txt3)]">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-1.5">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((r: any, i: number) => (
                <tr key={i} className="border-t border-[color:var(--line)]">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1.5">
                      {String(r[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={Math.max(1, columns.length)}
                    className="px-2 py-8 text-center text-[color:var(--txt3)]"
                  >
                    {result ? 'Nothing to report for this period.' : 'Pick a report and run it.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * Reorder alerts.
 *
 * Every stock movement re-checks its item, so an alert exists the moment the
 * shelf hits the level the unit set — not when somebody next opens a report.
 * The sweep button exists for stock that moved outside the app.
 */
function ReorderTab() {
  const { t: tr } = useI18n();
  const L = useLabels();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['reorder-alerts'],
    queryFn: () => api('/inventory/reorder-alerts'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reorder-alerts'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const sweep = useMutation({
    mutationFn: () => api('/inventory/reorder-alerts/sweep', { method: 'POST', body: '{}' }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });

  const act = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'acknowledge' | 'resolve' }) =>
      api(`/inventory/reorder-alerts/${id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ note: note[id] || undefined }),
      }),
    onSuccess: refresh,
    onError: (e: any) => setErr(e.message),
  });

  const total = (alerts as any[]).reduce((n, a) => n + Number(a.estimatedCost || 0), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="chip">
          {(alerts as any[]).length} {tr('reorder.title').toLowerCase()}
        </span>
        <span className="chip">
          {tr('reorder.estimated')} {inr(total)}
        </span>
        <button
          className="btn-secondary ml-auto"
          onClick={() => sweep.mutate()}
          disabled={sweep.isPending}
        >
          <PackageCheck className="mr-1 inline h-4 w-4" />
          {tr('reorder.sweep')}
        </button>
      </div>
      <ErrorNote msg={err} />
      {!(alerts as any[]).length && !isLoading ? (
        <p className="card p-6 text-center text-sm text-[color:var(--txt3)]">
          {tr('reorder.none')}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(alerts as any[]).map((a) => (
            <div className="card p-4" key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-heading font-extrabold">{a.name}</div>
                  <div className="text-[11px] font-semibold text-stone-500">
                    {a.sku} · {a.category}
                  </div>
                </div>
                <Badge tone={a.severity === 'CRITICAL' ? 'red' : 'honey'} dot>
                  {a.severity === 'CRITICAL' ? tr('reorder.critical') : tr('reorder.low')}
                </Badge>
              </div>
              <div className="mt-3 flex items-end gap-4">
                <div>
                  <div className="text-2xl font-black">{a.quantity}</div>
                  <div className="text-[10px] font-bold uppercase text-stone-400">in stock</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-stone-400">{a.reorderLevel}</div>
                  <div className="text-[10px] font-bold uppercase text-stone-400">reorder at</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-heading font-black">{inr(a.estimatedCost)}</div>
                  <div className="text-[10px] font-bold uppercase text-stone-400">
                    {tr('reorder.estimated')}
                  </div>
                </div>
              </div>
              <input
                className="input mt-3"
                placeholder="Note (optional)"
                value={note[a.id] ?? ''}
                onChange={(e) => setNote({ ...note, [a.id]: e.target.value })}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-secondary flex-1 text-xs"
                  onClick={() => act.mutate({ id: a.id, kind: 'acknowledge' })}
                >
                  {tr('reorder.ack')}
                </button>
                <button
                  className="btn-secondary flex-1 text-xs"
                  onClick={() => act.mutate({ id: a.id, kind: 'resolve' })}
                >
                  {tr('reorder.resolve')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

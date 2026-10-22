/**
 * Procurement rules — pure functions.
 *
 * PRF (purchase request) → PO (purchase order) → GRN (goods receipt note).
 * The sequence exists so that no stock appears on the shelf without someone
 * having approved the spend and someone else having counted the delivery.
 */

export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'CLOSED',
] as const;
export const ORDER_STATUSES = ['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const;
export const PETTY_CASH_TYPES = ['TOPUP', 'SPEND', 'RETURN'] as const;
export const IO_DIRECTIONS = ['INWARD', 'OUTWARD'] as const;
export const IO_CATEGORIES = [
  'COURIER',
  'DOCUMENT',
  'ASSET',
  'REPAIR',
  'VISITOR',
  'OTHER',
] as const;

/** A request can only move forward; nothing silently reopens. */
export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CLOSED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['ORDERED', 'CLOSED'],
  REJECTED: ['DRAFT', 'CLOSED'],
  ORDERED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionRequest(from: string, to: string): boolean {
  return (REQUEST_TRANSITIONS[from] ?? []).includes(to);
}

/** Does the requester still need a decision? (used by the notification badge) */
export function awaitingApproval(status: string): boolean {
  return status === 'SUBMITTED';
}

export interface OrderLineLike {
  quantity: number;
  unitCost: number | string;
  receivedQty?: number;
}

export function orderTotal(lines: OrderLineLike[]): number {
  return lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitCost), 0);
}

/**
 * Status after a receipt: RECEIVED when every line is fulfilled, PARTIAL when
 * something arrived but not everything, unchanged otherwise.
 */
export function statusAfterReceipt(lines: OrderLineLike[]): 'RECEIVED' | 'PARTIAL' | 'SENT' {
  if (!lines.length) return 'SENT';
  const complete = lines.every((l) => (l.receivedQty ?? 0) >= l.quantity);
  if (complete) return 'RECEIVED';
  const any = lines.some((l) => (l.receivedQty ?? 0) > 0);
  return any ? 'PARTIAL' : 'SENT';
}

/** How much of a line is still outstanding. */
export function outstandingQty(line: OrderLineLike): number {
  return Math.max(0, line.quantity - (line.receivedQty ?? 0));
}

/**
 * Reorder suggestion.
 *
 * INV2 (the founder's reorder-quantity basis) is still open, so the default is
 * deliberately dumb and predictable: bring stock back up to twice the reorder
 * level. The multiplier is a parameter so the decision, when it lands, changes
 * one number instead of a query.
 */
export function reorderSuggestion(
  item: { quantity: number; reorderLevel: number },
  multiplier = 2,
): { needed: boolean; suggestedQty: number } {
  if (item.reorderLevel <= 0) return { needed: false, suggestedQty: 0 };
  if (item.quantity > item.reorderLevel) return { needed: false, suggestedQty: 0 };
  const target = Math.ceil(item.reorderLevel * multiplier);
  return { needed: true, suggestedQty: Math.max(1, target - item.quantity) };
}

// ───────────────────────────── serials ─────────────────────────────

export function poNumber(unitCode: string, serial: number, yearShort: string): string {
  return `BB-${unitCode}-PO-${yearShort}-${String(serial).padStart(4, '0')}`;
}

export function grnNumber(unitCode: string, serial: number, yearShort: string): string {
  return `BB-${unitCode}-GRN-${yearShort}-${String(serial).padStart(4, '0')}`;
}

/** Next serial for a PO/GRN prefix, never reused. */
export function nextSerial(prefix: string, lastSerial: string | null | undefined): number {
  if (!lastSerial || !lastSerial.startsWith(prefix)) return 1;
  const n = parseInt(lastSerial.slice(prefix.length), 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

// ───────────────────────────── petty cash ─────────────────────────────

export interface PettyCashLike {
  type: string;
  amount: number | string;
}

/** Float + top-ups − spends + returns. */
export function pettyCashBalance(float: number, entries: PettyCashLike[]): number {
  let balance = float;
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.type === 'TOPUP') balance += a;
    else if (e.type === 'SPEND') balance -= a;
    else if (e.type === 'RETURN') balance += a;
  }
  return Math.round(balance * 100) / 100;
}

/** A spend may never take the float below zero. */
export function canSpend(balance: number, amount: number): boolean {
  return amount > 0 && amount <= balance;
}

// ───────────────────────────── reports ─────────────────────────────

export const PROCUREMENT_REPORTS = [
  { key: 'stock-on-hand', name: 'Stock on Hand' },
  { key: 'low-stock', name: 'Low Stock / Reorder' },
  { key: 'movements', name: 'Stock Movement Register' },
  { key: 'valuation', name: 'Category-wise Valuation' },
  { key: 'consumption', name: 'Consumption by Item' },
  { key: 'vendor-purchases', name: 'Vendor-wise Purchases' },
  { key: 'open-orders', name: 'Open Purchase Orders' },
  { key: 'grn-register', name: 'Goods Receipt Register' },
  { key: 'issue-register', name: 'Issue Register' },
  { key: 'petty-cash', name: 'Petty Cash Ledger' },
] as const;

export type ProcurementReportKey = (typeof PROCUREMENT_REPORTS)[number]['key'];

/** Reorder report rows, sorted by how badly the item is needed. */
export function lowStockRows(items: { quantity: number; reorderLevel: number }[], multiplier = 2) {
  return items
    .map((i) => ({ ...i, ...reorderSuggestion(i, multiplier) }))
    .filter((i) => i.needed)
    .sort(
      (a, b) => a.quantity / Math.max(1, a.reorderLevel) - b.quantity / Math.max(1, b.reorderLevel),
    );
}

/** Stock value per category. */
export function valuationRows(
  items: { category: string; quantity: number; unitCost: number | string }[],
) {
  const map = new Map<
    string,
    { category: string; items: number; quantity: number; value: number }
  >();
  for (const i of items) {
    const row = map.get(i.category) ?? { category: i.category, items: 0, quantity: 0, value: 0 };
    row.items += 1;
    row.quantity += i.quantity;
    row.value += i.quantity * Number(i.unitCost || 0);
    map.set(i.category, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Consumption per item from ISSUE movements. */
export function consumptionRows(
  movements: {
    itemId: string;
    type: string;
    quantity: number;
    unitCost?: number | string | null;
    item?: { name?: string; category?: string } | null;
  }[],
) {
  const map = new Map<
    string,
    { itemId: string; name: string; category: string; issued: number; value: number }
  >();
  for (const m of movements) {
    if (m.type !== 'ISSUE') continue;
    const key = m.itemId;
    const row = map.get(key) ?? {
      itemId: key,
      name: m.item?.name ?? key,
      category: m.item?.category ?? '—',
      issued: 0,
      value: 0,
    };
    row.issued += Math.abs(m.quantity);
    row.value += Math.abs(m.quantity) * Number(m.unitCost ?? 0);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.issued - a.issued);
}

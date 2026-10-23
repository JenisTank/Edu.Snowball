/**
 * Reorder alerts.
 *
 * The reorder level is the number the unit sets per item ("tell me when we drop
 * to 10"). The alert is raised the moment stock crosses that line — on the
 * movement that crossed it, not the next time somebody opens a report — and it
 * clears itself when a receipt puts the shelf back above the line.
 *
 * One open alert per item: a fortnight of small issues must not create a
 * fortnight of rows for the same box of crayons.
 */

export type AlertSignal = 'RAISED' | 'CLEARED' | 'UNCHANGED';

export interface StockLine {
  quantity: number;
  reorderLevel: number;
}

/**
 * What should happen to an item's alert after its stock changed.
 *
 * `reorderLevel: 0` means "this item is not tracked for reorder" — the spec's
 * INV2 answer, which the client has now given as "alert on the set amount".
 */
export function alertSignal(item: StockLine, hasOpenAlert: boolean): AlertSignal {
  if (item.reorderLevel <= 0) return hasOpenAlert ? 'CLEARED' : 'UNCHANGED';
  const low = item.quantity <= item.reorderLevel;
  if (low && !hasOpenAlert) return 'RAISED';
  if (!low && hasOpenAlert) return 'CLEARED';
  return 'UNCHANGED';
}

/** Short line for the desk: "Craft paper — 4 left (reorder at 10)". */
export function alertSummary(
  item: { name: string; sku: string; quantity: number; reorderLevel: number },
  hasOpenAlert: boolean,
): string | null {
  if (alertSignal(item, hasOpenAlert) !== 'RAISED') return null;
  return `${item.name} — ${item.quantity} left (reorder at ${item.reorderLevel})`;
}

/**
 * How urgent is it? Below half the reorder level is the "order today" band;
 * touching the level from above is "order this week".
 */
export function alertSeverity(item: StockLine): 'CRITICAL' | 'LOW' | 'OK' {
  if (item.reorderLevel <= 0) return 'OK';
  if (item.quantity <= Math.floor(item.reorderLevel / 2)) return 'CRITICAL';
  if (item.quantity <= item.reorderLevel) return 'LOW';
  return 'OK';
}

/** Items that need an alert, newest-lowest first. */
export function itemsNeedingAlert<T extends StockLine & { name: string; sku: string }>(
  items: T[],
): T[] {
  return items
    .filter((i) => alertSignal(i, false) === 'RAISED')
    .sort(
      (a, b) => a.quantity / Math.max(1, a.reorderLevel) - b.quantity / Math.max(1, b.reorderLevel),
    );
}

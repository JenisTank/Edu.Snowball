/**
 * Opening-stock rules — pure functions, no database access.
 *
 * "Opening stock per new unit" is not an ordinary receipt: it is the count the
 * centre starts from, so it may only be entered once per item and it must be
 * positive. Entering it twice silently doubles the balance, which is why the
 * controller refuses rather than upserts.
 */

export interface OpeningStockLine {
  itemId: string;
  quantity: number;
  unitCost?: number | null;
}

export const MAX_OPENING_STOCK = 100_000;

/** Returns one error message, or null when the whole batch is acceptable. */
export function validateOpeningStock(lines: OpeningStockLine[]): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'At least one item is required';
  if (lines.length > 500) return 'A single opening-stock batch may not exceed 500 items';
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    const where = `Line ${i + 1}`;
    if (!line?.itemId) return `${where}: item is required`;
    if (seen.has(line.itemId)) return `${where}: that item appears twice`;
    seen.add(line.itemId);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      return `${where}: opening quantity must be greater than zero`;
    if (!Number.isInteger(line.quantity))
      return `${where}: opening quantity must be a whole number`;
    if (line.quantity > MAX_OPENING_STOCK)
      return `${where}: opening quantity looks wrong (max ${MAX_OPENING_STOCK})`;
    if (line.unitCost != null && (!Number.isFinite(line.unitCost) || line.unitCost < 0))
      return `${where}: unit cost cannot be negative`;
  }
  return null;
}

/** Value of the opening batch, for the audit row. */
export function openingStockValue(lines: OpeningStockLine[]): number {
  return (
    Math.round(lines.reduce((sum, l) => sum + l.quantity * Number(l.unitCost ?? 0), 0) * 100) / 100
  );
}

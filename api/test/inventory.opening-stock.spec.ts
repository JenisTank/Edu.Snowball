import {
  MAX_OPENING_STOCK,
  openingStockValue,
  validateOpeningStock,
} from '../src/modules/inventory/opening-stock.rules';

describe('opening stock', () => {
  it('accepts a clean batch', () => {
    expect(
      validateOpeningStock([
        { itemId: 'a', quantity: 12, unitCost: 45.5 },
        { itemId: 'b', quantity: 3 },
      ]),
    ).toBeNull();
  });

  it('rejects an empty or oversized batch', () => {
    expect(validateOpeningStock([])).toBe('At least one item is required');
    expect(
      validateOpeningStock(
        Array.from({ length: 501 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 })),
      ),
    ).toBe('A single opening-stock batch may not exceed 500 items');
  });

  it('rejects duplicates — the second entry would silently double the balance', () => {
    expect(
      validateOpeningStock([
        { itemId: 'a', quantity: 1 },
        { itemId: 'a', quantity: 2 },
      ]),
    ).toBe('Line 2: that item appears twice');
  });

  it('rejects zero, negative, fractional and absurd quantities', () => {
    expect(validateOpeningStock([{ itemId: 'a', quantity: 0 }])).toContain('greater than zero');
    expect(validateOpeningStock([{ itemId: 'a', quantity: -4 }])).toContain('greater than zero');
    expect(validateOpeningStock([{ itemId: 'a', quantity: 2.5 }])).toContain('whole number');
    expect(validateOpeningStock([{ itemId: 'a', quantity: MAX_OPENING_STOCK + 1 }])).toContain(
      'looks wrong',
    );
    expect(validateOpeningStock([{ itemId: 'a', quantity: Number.NaN }])).toContain(
      'greater than zero',
    );
  });

  it('rejects a negative unit cost and a missing item', () => {
    expect(validateOpeningStock([{ itemId: 'a', quantity: 1, unitCost: -1 }])).toContain(
      'cannot be negative',
    );
    expect(validateOpeningStock([{ itemId: '', quantity: 1 }])).toBe('Line 1: item is required');
  });

  it('values the batch to two decimals', () => {
    expect(
      openingStockValue([
        { itemId: 'a', quantity: 3, unitCost: 19.99 },
        { itemId: 'b', quantity: 2, unitCost: 5.5 },
      ]),
    ).toBe(70.97);
    expect(openingStockValue([{ itemId: 'c', quantity: 4 }])).toBe(0);
  });
});

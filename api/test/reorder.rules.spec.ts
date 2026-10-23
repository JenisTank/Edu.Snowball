import {
  alertSeverity,
  alertSignal,
  alertSummary,
  itemsNeedingAlert,
} from '../src/modules/inventory/reorder.rules';

describe('reorder alerts', () => {
  it('raises an alert the moment stock touches the level', () => {
    expect(alertSignal({ quantity: 10, reorderLevel: 10 }, false)).toBe('RAISED');
    expect(alertSignal({ quantity: 4, reorderLevel: 10 }, false)).toBe('RAISED');
  });

  it('does not raise twice for the same item', () => {
    expect(alertSignal({ quantity: 4, reorderLevel: 10 }, true)).toBe('UNCHANGED');
  });

  it('stays quiet while stock is above the level', () => {
    expect(alertSignal({ quantity: 11, reorderLevel: 10 }, false)).toBe('UNCHANGED');
  });

  it('clears when a receipt puts the item back above the level', () => {
    expect(alertSignal({ quantity: 25, reorderLevel: 10 }, true)).toBe('CLEARED');
  });

  it('ignores items that are not tracked for reorder', () => {
    expect(alertSignal({ quantity: 0, reorderLevel: 0 }, false)).toBe('UNCHANGED');
    expect(alertSignal({ quantity: 0, reorderLevel: 0 }, true)).toBe('CLEARED');
  });

  it('calls out the critical band below half the level', () => {
    expect(alertSeverity({ quantity: 4, reorderLevel: 10 })).toBe('CRITICAL');
    expect(alertSeverity({ quantity: 9, reorderLevel: 10 })).toBe('LOW');
    expect(alertSeverity({ quantity: 40, reorderLevel: 10 })).toBe('OK');
  });

  it('writes the desk line in plain language', () => {
    expect(
      alertSummary({ name: 'Craft paper', sku: 'AC-01', quantity: 4, reorderLevel: 10 }, false),
    ).toBe('Craft paper — 4 left (reorder at 10)');
    expect(
      alertSummary({ name: 'Craft paper', sku: 'AC-01', quantity: 4, reorderLevel: 10 }, true),
    ).toBeNull();
  });

  it('sorts the items that need attention worst-first', () => {
    const rows = itemsNeedingAlert([
      { name: 'a', sku: 'A', quantity: 9, reorderLevel: 10 },
      { name: 'b', sku: 'B', quantity: 1, reorderLevel: 10 },
      { name: 'c', sku: 'C', quantity: 50, reorderLevel: 10 },
      { name: 'd', sku: 'D', quantity: 5, reorderLevel: 10 },
    ]);
    expect(rows.map((r) => r.sku)).toEqual(['B', 'D', 'A']);
  });
});

import {
  PROCUREMENT_REPORTS,
  awaitingApproval,
  canSpend,
  canTransitionRequest,
  consumptionRows,
  grnNumber,
  lowStockRows,
  nextSerial,
  orderTotal,
  outstandingQty,
  pettyCashBalance,
  poNumber,
  reorderSuggestion,
  statusAfterReceipt,
  valuationRows,
} from '../src/modules/inventory/procurement.rules';

describe('procurement', () => {
  describe('request workflow', () => {
    it('only allows forward transitions', () => {
      expect(canTransitionRequest('DRAFT', 'SUBMITTED')).toBe(true);
      expect(canTransitionRequest('SUBMITTED', 'APPROVED')).toBe(true);
      expect(canTransitionRequest('SUBMITTED', 'ORDERED')).toBe(false);
      expect(canTransitionRequest('APPROVED', 'ORDERED')).toBe(true);
      expect(canTransitionRequest('ORDERED', 'SUBMITTED')).toBe(false);
      expect(canTransitionRequest('CLOSED', 'DRAFT')).toBe(false);
    });

    it('flags what needs a decision', () => {
      expect(awaitingApproval('SUBMITTED')).toBe(true);
      expect(awaitingApproval('DRAFT')).toBe(false);
      expect(awaitingApproval('APPROVED')).toBe(false);
    });
  });

  describe('purchase orders', () => {
    it('totals quantity × unit cost', () => {
      expect(
        orderTotal([
          { quantity: 10, unitCost: 25 },
          { quantity: 2, unitCost: 199.5 },
        ]),
      ).toBe(649);
      expect(orderTotal([])).toBe(0);
    });

    it('becomes PARTIAL then RECEIVED as goods arrive', () => {
      const lines = [
        { quantity: 10, unitCost: 1, receivedQty: 0 },
        { quantity: 5, unitCost: 1, receivedQty: 0 },
      ];
      expect(statusAfterReceipt(lines)).toBe('SENT');
      expect(statusAfterReceipt([{ ...lines[0], receivedQty: 4 }, lines[1]])).toBe('PARTIAL');
      expect(
        statusAfterReceipt([
          { ...lines[0], receivedQty: 10 },
          { ...lines[1], receivedQty: 5 },
        ]),
      ).toBe('RECEIVED');
    });

    it('never reports a negative outstanding quantity', () => {
      expect(outstandingQty({ quantity: 5, unitCost: 1, receivedQty: 8 })).toBe(0);
      expect(outstandingQty({ quantity: 5, unitCost: 1, receivedQty: 2 })).toBe(3);
    });

    it('numbers POs and GRNs per unit and never reuses a serial', () => {
      expect(poNumber('U1', 7, '2627')).toBe('BB-U1-PO-2627-0007');
      expect(grnNumber('U2', 12, '2627')).toBe('BB-U2-GRN-2627-0012');
      expect(nextSerial('BB-U1-PO-2627-', 'BB-U1-PO-2627-0007')).toBe(8);
      expect(nextSerial('BB-U1-PO-2627-', null)).toBe(1);
      expect(nextSerial('BB-U1-PO-2627-', 'BB-U2-PO-2627-0009')).toBe(1);
    });
  });

  describe('reorder', () => {
    it('suggests topping up to twice the reorder level', () => {
      expect(reorderSuggestion({ quantity: 2, reorderLevel: 10 })).toEqual({
        needed: true,
        suggestedQty: 18,
      });
      expect(reorderSuggestion({ quantity: 50, reorderLevel: 10 })).toEqual({
        needed: false,
        suggestedQty: 0,
      });
      expect(reorderSuggestion({ quantity: 0, reorderLevel: 0 })).toEqual({
        needed: false,
        suggestedQty: 0,
      });
    });

    it('sorts the worst shortage first', () => {
      const rows = lowStockRows([
        { quantity: 8, reorderLevel: 10 }, // 80%
        { quantity: 0, reorderLevel: 5 }, // 0%
        { quantity: 50, reorderLevel: 10 }, // fine
      ]);
      expect(rows).toHaveLength(2);
      expect(rows[0].quantity).toBe(0);
    });
  });

  describe('petty cash', () => {
    it('reconstructs the float from the ledger', () => {
      expect(
        pettyCashBalance(5000, [
          { type: 'SPEND', amount: 1200 },
          { type: 'TOPUP', amount: 2000 },
          { type: 'SPEND', amount: 300.5 },
          { type: 'RETURN', amount: 100 },
        ]),
      ).toBe(5599.5);
      expect(pettyCashBalance(5000, [])).toBe(5000);
    });

    it('refuses a spend beyond the balance', () => {
      expect(canSpend(1000, 999)).toBe(true);
      expect(canSpend(1000, 1000)).toBe(true);
      expect(canSpend(1000, 1001)).toBe(false);
      expect(canSpend(1000, 0)).toBe(false);
      expect(canSpend(1000, -5)).toBe(false);
    });
  });

  describe('reports', () => {
    it('catalogues ten inventory reports', () => {
      expect(PROCUREMENT_REPORTS).toHaveLength(10);
    });

    it('values stock per category', () => {
      const rows = valuationRows([
        { category: 'ACADEMIC', quantity: 10, unitCost: 50 },
        { category: 'ACADEMIC', quantity: 5, unitCost: 20 },
        { category: 'SAFETY', quantity: 2, unitCost: 500 },
      ]);
      expect(rows[0]).toEqual({ category: 'SAFETY', items: 1, quantity: 2, value: 1000 });
      expect(rows[1]).toEqual({ category: 'ACADEMIC', items: 2, quantity: 15, value: 600 });
    });

    it('counts only issues as consumption', () => {
      const rows = consumptionRows([
        { itemId: 'i1', type: 'ISSUE', quantity: -5, unitCost: 10, item: { name: 'Crayons' } },
        { itemId: 'i1', type: 'ISSUE', quantity: -3, unitCost: 10, item: { name: 'Crayons' } },
        { itemId: 'i1', type: 'RECEIPT', quantity: 100, unitCost: 10, item: { name: 'Crayons' } },
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: 'Crayons', issued: 8, value: 80 });
    });
  });
});

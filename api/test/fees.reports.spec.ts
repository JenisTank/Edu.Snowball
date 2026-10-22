import {
  addonRegister,
  ageingBucket,
  cancellationRows,
  collectionTotals,
  csvCell,
  dailyCollection,
  dayBook,
  discountRows,
  feeStatusRows,
  headWiseRows,
  monthlyCollection,
  outstandingRows,
  paymentModeAnalysis,
  programmeRevenue,
  REPORT_CATALOGUE,
  tallyExport,
  toCsv,
  unitWiseRows,
} from '../src/modules/fees/reports.rules';

const receipt = (over: Record<string, any> = {}) => ({
  receiptNo: 'BB-U1-RCPT-2627-0001',
  amount: 20000,
  paymentMode: 'UPI',
  paymentDate: '2026-10-10',
  ledgerType: 'PRESCHOOL',
  student: {
    firstName: 'Aarav',
    lastName: 'Patel',
    admissionNo: 'BB-U1-2627-0001',
    programme: { name: 'PlayHouse' },
    unit: { code: 'U1' },
  },
  ...over,
});

const ledgerRow = (over: Record<string, any> = {}) => ({
  id: 's1',
  admissionNo: 'BB-U1-2627-0001',
  name: 'Aarav Patel',
  unit: 'U1',
  programme: { name: 'PlayHouse' },
  plan: 'PLAN_A',
  gross: 120000,
  discount: 12000,
  net: 108000,
  paid: 36000,
  balance: 72000,
  overdue: 36000,
  sibling: true,
  instalments: [
    { no: 1, amount: 36000, dueDate: '2026-04-10', paid: 36000, status: 'PAID' },
    { no: 2, amount: 36000, dueDate: '2026-07-10', paid: 0, status: 'OVERDUE' },
    { no: 3, amount: 36000, dueDate: '2026-10-10', paid: 0, status: 'OVERDUE' },
  ],
  ...over,
});

describe('fee reports', () => {
  it('catalogues all fourteen reports the spec requires', () => {
    expect(REPORT_CATALOGUE).toHaveLength(14);
    const keys = REPORT_CATALOGUE.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'daily-collection',
        'outstanding',
        'fee-status',
        'day-book',
        'monthly-collection',
        'unit-wise',
        'payment-mode',
        'discounts',
        'cancellations',
        'structure-master',
        'programme-revenue',
        'head-wise',
        'addons',
        'tally-export',
      ]),
    );
  });

  describe('collections', () => {
    it('excludes cancelled receipts and filters by range', () => {
      const rows = [
        receipt(),
        receipt({ receiptNo: 'R2', amount: 5000, isCancelled: true }),
        receipt({ receiptNo: 'R3', amount: 7000, paymentDate: '2026-11-01' }),
      ];
      const inRange = collectionTotals(
        rows.filter((r) => !r.isCancelled && String(r.paymentDate) <= '2026-10-31'),
      );
      expect(inRange.total).toBe(20000);
      expect(inRange.count).toBe(1);
    });

    it('splits a day by payment mode', () => {
      const total = collectionTotals([
        receipt(),
        receipt({ receiptNo: 'R2', paymentMode: 'CASH', amount: 5000 }),
        receipt({ receiptNo: 'R3', paymentMode: 'CASH', amount: 1000 }),
      ]);
      expect(total.total).toBe(26000);
      expect(total.byMode.CASH).toEqual({ amount: 6000, count: 2 });
      expect(total.byMode.UPI).toEqual({ amount: 20000, count: 1 });
    });

    it('groups daily collection newest first', () => {
      const days = dailyCollection([
        receipt({ paymentDate: '2026-10-09', amount: 100 }),
        receipt({ receiptNo: 'R2', paymentDate: '2026-10-10', amount: 200 }),
        receipt({ receiptNo: 'R3', paymentDate: '2026-10-10', amount: 300, paymentMode: 'CASH' }),
      ]);
      expect(days[0]).toEqual({
        date: '2026-10-10',
        total: 500,
        count: 2,
        byMode: { UPI: 200, CASH: 300 },
      });
      expect(days[1].date).toBe('2026-10-09');
    });

    it('builds a day book whose net reconciles with the cash box', () => {
      const book = dayBook(
        [
          receipt({ receiptNo: 'R1', amount: 1000 }),
          receipt({ receiptNo: 'R2', amount: 500 }),
          receipt({ receiptNo: 'R3', amount: 300, isCancelled: true }),
        ],
        '2026-10-10',
      );
      expect(book.receivedTotal).toBe(1500);
      expect(book.cancelledTotal).toBe(300);
      expect(book.netCollection).toBe(1200);
      expect(book.closingBalance).toBe(book.netCollection);
      expect(book.byMode.UPI.amount).toBe(1500);
    });

    it('keeps months with no collection visible', () => {
      const months = monthlyCollection([receipt()], 2026);
      expect(months).toHaveLength(12);
      expect(months[9].total).toBe(20000); // October
      expect(months[0].total).toBe(0);
    });

    it('computes mode share against the period total', () => {
      const modes = paymentModeAnalysis([
        receipt({ amount: 7500, paymentMode: 'UPI' }),
        receipt({ receiptNo: 'R2', amount: 2500, paymentMode: 'CASH' }),
      ]);
      expect(modes[0]).toMatchObject({ mode: 'UPI', amount: 7500, sharePct: 75 });
      expect(modes[1]).toMatchObject({ mode: 'CASH', amount: 2500, sharePct: 25 });
    });
  });

  describe('receivables', () => {
    it('only lists students who still owe money, largest first', () => {
      const { rows, totals } = outstandingRows(
        [ledgerRow(), ledgerRow({ id: 's2', name: 'Vivaan', balance: 100000, overdue: 0 })],
        '2026-10-22',
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Vivaan');
      expect(totals.outstanding).toBe(172000);
      expect(totals.students).toBe(2);
    });

    it('ages a balance by its oldest unpaid instalment', () => {
      // The oldest unpaid instalment is 10 Jul, so the bucket follows that date.
      expect(ageingBucket(ledgerRow(), '2026-07-20')).toBe('1-30');
      expect(ageingBucket(ledgerRow(), '2026-08-25')).toBe('31-60');
      expect(ageingBucket(ledgerRow(), '2026-09-30')).toBe('61-90');
      expect(ageingBucket(ledgerRow(), '2026-11-05')).toBe('90+');
      expect(ageingBucket(ledgerRow({ instalments: [], balance: 0 }), '2026-10-22')).toBe(
        'CURRENT',
      );
    });

    it('buckets every outstanding row into the ageing report', () => {
      const { totals } = outstandingRows([ledgerRow()], '2026-11-05');
      expect(Object.keys(totals.buckets)).toEqual(['CURRENT', '1-30', '31-60', '61-90', '90+']);
      expect(totals.buckets['90+']).toBe(72000);
    });

    it('classifies fee status and counts it', () => {
      const { rows, counts } = feeStatusRows([
        ledgerRow(),
        ledgerRow({ id: 's2', balance: 0, overdue: 0, paid: 108000 }),
        ledgerRow({ id: 's3', paid: 0, balance: 108000, overdue: 0 }),
      ]);
      expect(rows[1].status).toBe('PAID');
      expect(rows[0].status).toBe('OVERDUE');
      expect(rows[2].status).toBe('DUE');
      expect(counts).toEqual({ PAID: 1, OVERDUE: 1, DUE: 1, PARTIAL: 0 });
    });

    it('separates concession, manual discount and fines', () => {
      const d = discountRows(
        [ledgerRow()],
        [
          receipt({ discount: 2000, fine: 500 }),
          receipt({ receiptNo: 'R2', amount: 100, isCancelled: true, discount: 999 }),
        ],
      );
      expect(d.concessions).toHaveLength(1);
      expect(d.concessions[0].amount).toBe(12000);
      expect(d.manual[0].amount).toBe(2000);
      expect(d.fines[0].amount).toBe(500);
      expect(d.totals).toEqual({ concession: 12000, manualDiscount: 2000, fines: 500 });
    });

    it('logs cancellations with their amount and keeps the receipt number', () => {
      const c = cancellationRows([
        receipt({ isCancelled: true, amount: 4000, remarks: 'Bounced' }),
      ]);
      expect(c.count).toBe(1);
      expect(c.total).toBe(4000);
      expect(c.rows[0].receiptNo).toBe('BB-U1-RCPT-2627-0001');
      expect(c.rows[0].remarks).toBe('Bounced');
      expect(cancellationRows([receipt({ isCancelled: true })], { from: '2026-11-01' }).count).toBe(
        0,
      );
    });
  });

  describe('analysis', () => {
    it('reports programme revenue with shares', () => {
      const rows = programmeRevenue([
        ledgerRow({ paid: 60000 }),
        ledgerRow({ id: 's2', programme: { name: 'K1' }, paid: 20000 }),
      ]);
      expect(rows[0]).toMatchObject({
        programme: 'PlayHouse',
        students: 1,
        collected: 60000,
        sharePct: 75,
      });
      expect(rows[1]).toMatchObject({ programme: 'K1', collected: 20000, sharePct: 25 });
    });

    it('consolidates units for Head Office', () => {
      const res = unitWiseRows(
        [ledgerRow(), ledgerRow({ id: 's2', unit: 'U2', net: 90000, paid: 90000, balance: 0 })],
        [receipt({ amount: 5000 })],
      );
      expect(res.units).toHaveLength(2);
      expect(res.totals.billed).toBe(198000);
      expect(res.periodCollection).toBe(5000);
    });

    it('summarises heads with discounts as a negative line', () => {
      const heads = headWiseRows(
        [ledgerRow()],
        [receipt({ discount: 1000, fine: 250 })],
        [{ id: 'a1', label: 'Kit', amount: 3000, status: 'PAID', billedAt: '2026-06-01' }],
      );
      const byHead = Object.fromEntries(heads.map((h) => [h.head, h.amount]));
      expect(byHead['Late fines']).toBe(250);
      expect(byHead['Discounts given']).toBe(-1000);
      expect(byHead['Add-on fees']).toBe(3000);
      expect(byHead.Outstanding).toBe(72000);
    });

    it('separates evening money from preschool money', () => {
      const heads = headWiseRows([], [receipt({ ledgerType: 'EVENING', amount: 2500 })]);
      const byHead = Object.fromEntries(heads.map((h) => [h.head, h.amount]));
      expect(byHead['Evening activity']).toBe(2500);
      expect(byHead['Tuition (preschool)']).toBe(0);
    });

    it('registers add-ons with their settlement state', () => {
      const reg = addonRegister([
        {
          id: 'a1',
          label: 'Kit',
          amount: 3000,
          status: 'PENDING',
          billedAt: '2026-06-01',
          student: { admissionNo: 'BB-U1-2627-0001', firstName: 'A', lastName: 'P' },
        },
        { id: 'a2', label: 'Trip', amount: 1500, status: 'PAID', billedAt: '2026-06-02' },
        { id: 'a3', label: 'Late pickup', amount: 500, status: 'WAIVED', billedAt: '2026-06-03' },
      ]);
      expect(reg.totals).toEqual({ billed: 5000, pending: 3000, paid: 1500, waived: 500 });
      expect(reg.rows[0].admissionNo).toBe('BB-U1-2627-0001');
    });
  });

  describe('exports', () => {
    it('escapes CSV cells that would break a spreadsheet', () => {
      expect(csvCell('Patel, Aarav')).toBe('"Patel, Aarav"');
      expect(csvCell('say "hi"')).toBe('"say ""hi"""');
      expect(csvCell(42)).toBe('42');
      expect(csvCell(null)).toBe('');
    });

    it('writes a header row and stable columns', () => {
      const csv = toCsv(
        [
          { a: 1, b: 'x,y' },
          { a: 2, b: 'z' },
        ],
        ['a', 'b'],
      );
      expect(csv.split('\r\n')[0]).toBe('a,b');
      expect(csv).toContain('1,"x,y"');
      expect(toCsv([])).toBe('');
    });

    it('produces Tally vouchers with debit and credit ledgers', () => {
      const res = tallyExport([
        receipt({ paymentMode: 'CASH', amount: 1000 }),
        receipt({ receiptNo: 'R2', paymentMode: 'UPI', amount: 2000 }),
        receipt({ receiptNo: 'R3', isCancelled: true }),
      ]);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toMatchObject({
        voucherType: 'Receipt',
        debitLedger: 'Cash',
        creditLedger: 'School Fees',
        amount: 1000,
      });
      expect(res.rows[1].debitLedger).toBe('Bank');
      expect(res.total).toBe(3000);
    });
  });
});

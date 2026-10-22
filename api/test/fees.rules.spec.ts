import {
  DUE_DATES,
  buildLedger,
  buildSchedule,
  daysFromDue,
  nextSerial,
  receiptNo,
  reminderStage,
  siblingConcession,
} from '../src/modules/fees/fees.rules';

const structure = {
  totalFee: 60000,
  siblingDiscountPct: 10,
  instalment1: 40,
  instalment2: 30,
  instalment3: 30,
};

describe('fee schedule', () => {
  it('applies the 10% sibling concession and never mixes it with non-siblings', () => {
    expect(buildSchedule(structure, 'PLAN_A', true).discount).toBe(6000);
    expect(buildSchedule(structure, 'PLAN_A', true).net).toBe(54000);
    expect(buildSchedule(structure, 'PLAN_A', false).discount).toBe(0);
    expect(buildSchedule(structure, 'PLAN_A', false).net).toBe(60000);
  });

  it('rounds the concession to whole rupees', () => {
    expect(siblingConcession(33333, 10)).toBe(3333);
    expect(siblingConcession(60000, 0)).toBe(0);
    expect(siblingConcession(60000, -5)).toBe(0);
  });

  it('splits Plan A by the structure weights, summing exactly to net', () => {
    const { instalments, net } = buildSchedule(structure, 'PLAN_A', true);
    expect(instalments).toHaveLength(3);
    expect(instalments.map((i) => i.amount)).toEqual([21600, 16200, 16200]);
    expect(instalments.reduce((a, i) => a + i.amount, 0)).toBe(net);
  });

  it('absorbs rounding in the final instalment so parts always equal net', () => {
    const odd = {
      totalFee: 10000,
      siblingDiscountPct: 10,
      instalment1: 1,
      instalment2: 1,
      instalment3: 1,
    };
    const { instalments, net } = buildSchedule(odd, 'PLAN_A', true);
    expect(instalments.reduce((a, i) => a + i.amount, 0)).toBe(net);
    expect(net).toBe(9000);
  });

  it('builds Plan B as two halves and Plan C as a single payment', () => {
    expect(buildSchedule(structure, 'PLAN_B', false).instalments.map((i) => i.amount)).toEqual([
      30000, 30000,
    ]);
    expect(buildSchedule(structure, 'PLAN_C', false).instalments).toHaveLength(1);
  });

  it('dates instalments per the AY calendar', () => {
    expect(DUE_DATES.PLAN_A).toEqual(['2026-04-10', '2026-07-10', '2026-10-10']);
    expect(DUE_DATES.PLAN_B).toHaveLength(2);
    expect(DUE_DATES.PLAN_C).toHaveLength(1);
    expect(buildSchedule(structure, 'PLAN_A', false).instalments[2].dueDate).toBe('2026-10-10');
  });

  it('falls back to Plan C for an unknown plan instead of crashing', () => {
    const s = buildSchedule(structure, 'PLAN_UNKNOWN', false);
    expect(s.instalments).toHaveLength(1);
    expect(s.instalments[0].dueDate).toBe('2026-04-10');
  });
});

describe('student ledger', () => {
  const schedule = buildSchedule(structure, 'PLAN_A', false); // 60000 → 24000/18000/18000

  it('allocates payments to instalments in order', () => {
    const ledger = buildLedger(schedule, 'PLAN_A', [{ amount: 24000 }], '2026-05-01');
    expect(ledger.instalments[0].status).toBe('PAID');
    expect(ledger.instalments[1].status).toBe('UPCOMING');
    expect(ledger.balance).toBe(36000);
  });

  it('marks partially paid overdue instalments and sums the overdue amount', () => {
    const ledger = buildLedger(schedule, 'PLAN_A', [{ amount: 30000 }], '2026-12-01');
    expect(ledger.instalments[0].status).toBe('PAID');
    expect(ledger.instalments[1].status).toBe('PARTIAL · OVERDUE');
    expect(ledger.instalments[2].status).toBe('OVERDUE');
    // unpaid remainder: inst2 18000−6000 = 12000, plus inst3 18000 untouched
    expect(ledger.overdue).toBe(30000);
  });

  it('ignores cancelled receipts', () => {
    const ledger = buildLedger(
      schedule,
      'PLAN_A',
      [{ amount: 24000, isCancelled: true }],
      '2026-05-01',
    );
    expect(ledger.paid).toBe(0);
    expect(ledger.balance).toBe(60000);
  });

  it('keeps the evening ledger out of the preschool balance (dual-ledger rule)', () => {
    const ledger = buildLedger(
      schedule,
      'PLAN_A',
      [{ amount: 5000, ledgerType: 'EVENING' }],
      '2026-05-01',
    );
    expect(ledger.paid).toBe(0);
  });
});

describe('reminder cadence', () => {
  it('maps days-from-due to the T-5 / T-0 / T+3 / T+7 stages', () => {
    expect(reminderStage(-5)).toBe('T-5');
    expect(reminderStage(-1)).toBe('T-5');
    expect(reminderStage(0)).toBe('T-0');
    expect(reminderStage(3)).toBe('T+3');
    expect(reminderStage(6)).toBe('T+3');
    expect(reminderStage(7)).toBe('T+7');
    expect(reminderStage(30)).toBe('T+7');
  });

  it('sends nothing outside the configured windows', () => {
    expect(reminderStage(-6)).toBeNull();
    expect(reminderStage(1)).toBeNull();
    expect(reminderStage(2)).toBeNull();
  });

  it('computes whole days between due date and today', () => {
    expect(daysFromDue('2026-10-10', '2026-10-10')).toBe(0);
    expect(daysFromDue('2026-10-10', '2026-10-15')).toBe(5);
    expect(daysFromDue('2026-10-10', '2026-10-05')).toBe(-5);
  });
});

describe('receipt serials', () => {
  it('starts at 0001 for a unit with no receipts', () => {
    expect(nextSerial('BB-U1-RCPT-2627-', null)).toBe(1);
    expect(receiptNo('U1', 1)).toBe('BB-U1-RCPT-2627-0001');
  });

  it('increments per unit and pads to four digits', () => {
    expect(nextSerial('BB-U1-RCPT-2627-', 'BB-U1-RCPT-2627-0041')).toBe(42);
    expect(receiptNo('U2', 42)).toBe('BB-U2-RCPT-2627-0042');
  });

  it('never reuses a number, even after the last receipt is cancelled', () => {
    // the cancelled receipt still occupies its serial, so the next one is +1
    expect(nextSerial('BB-U1-RCPT-2627-', 'BB-U1-RCPT-2627-0007')).toBe(8);
  });

  it('ignores serials from another unit prefix', () => {
    expect(nextSerial('BB-U1-RCPT-2627-', 'BB-U2-RCPT-2627-0099')).toBe(1);
  });
});

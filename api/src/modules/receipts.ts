// ─────────────────────────────────────────────────────────────
// Receipt issuing — the ONE place a fee receipt number is minted.
// Used by the counter collection screen (fees.controller) and by the
// online payment settlement path (payments.controller), so cash and
// Razorpay/UPI receipts share a single per-unit sequence.
// ─────────────────────────────────────────────────────────────
import { PrismaService } from '../prisma.service';

const AY_SHORT = '2627';

export interface IssueReceiptInput {
  studentId: string;
  unitId: string;
  unitCode: string;
  amount: number;
  paymentMode: string; // CASH | CHEQUE | UPI | POS | RAZORPAY | NEFT
  ledgerType?: string; // PRESCHOOL | EVENING — dual ledger, never merged
  reference?: string | null;
  remarks?: string | null;
  instalmentNo?: number | null;
  discount?: number;
  fine?: number;
  paymentDate?: string | Date;
  collectedById?: string | null;
}

// Next receipt serial for a unit: BB-U?-RCPT-2627-NNNN (sequential, never reused)
export async function nextReceiptNo(prisma: PrismaService, unitCode: string) {
  const prefix = `BB-${unitCode}-RCPT-${AY_SHORT}-`;
  const last = await prisma.feeTransaction.findFirst({
    where: { receiptNo: { startsWith: prefix } },
    orderBy: { receiptNo: 'desc' },
  });
  const serial = last ? parseInt(last.receiptNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(serial).padStart(4, '0')}`;
}

export async function issueReceipt(prisma: PrismaService, i: IssueReceiptInput) {
  const receiptNo = await nextReceiptNo(prisma, i.unitCode);
  return prisma.feeTransaction.create({
    data: {
      studentId: i.studentId,
      unitId: i.unitId,
      ledgerType: (i.ledgerType as any) ?? 'PRESCHOOL',
      amount: i.amount,
      discount: i.discount ?? 0,
      fine: i.fine ?? 0,
      paymentMode: i.paymentMode as any,
      reference: i.reference ?? null,
      paymentDate: new Date(i.paymentDate ?? new Date().toISOString().slice(0, 10)),
      instalmentNo: i.instalmentNo ?? null,
      receiptNo,
      remarks: i.remarks ?? null,
      collectedById: i.collectedById ?? null,
    },
  });
}

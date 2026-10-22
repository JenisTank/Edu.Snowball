import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service';
import { ACADEMIC_YEAR_SHORT, nextSerial, receiptNo } from '../fees/fees.rules';

/**
 * Turns a captured online payment into the same artefacts a counter receipt
 * produces: one FeeTransaction row (which every report and ledger reads) plus a
 * RECEIPT message for the parent. Kept out of the controllers so the webhook and
 * the browser-side signature check cannot drift apart.
 */
@Injectable()
export class OnlineSettlementService {
  private readonly log = new Logger('OnlineSettlement');

  constructor(private prisma: PrismaService) {}

  async settle(
    intent: {
      id: string;
      studentId: string;
      unitId: string;
      amount: any;
      ledgerType: string;
      orderId: string;
    },
    paymentId: string | null,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: intent.studentId },
      include: { unit: { select: { code: true } } },
    });
    if (!student) throw new Error('Student not found for online payment');

    const prefix = `BB-${student.unit.code}-RCPT-${ACADEMIC_YEAR_SHORT}-`;
    const last = await this.prisma.feeTransaction.findFirst({
      where: { receiptNo: { startsWith: prefix } },
      orderBy: { receiptNo: 'desc' },
    });
    const next = receiptNo(student.unit.code, nextSerial(prefix, last?.receiptNo));

    const amount = Number(intent.amount);
    const txn = await this.prisma.feeTransaction.create({
      data: {
        studentId: intent.studentId,
        unitId: intent.unitId,
        ledgerType: intent.ledgerType as any,
        amount,
        discount: 0,
        fine: 0,
        paymentMode: 'RAZORPAY' as any,
        reference: paymentId ?? intent.orderId,
        paymentDate: new Date(),
        instalmentNo: null,
        receiptNo: next,
        remarks: 'Online payment (Razorpay)',
        collectedById: null,
      },
    });

    const updated = await this.prisma.onlinePayment.update({
      where: { id: intent.id },
      data: {
        status: 'PAID',
        providerPaymentId: paymentId,
        transactionId: txn.id,
        paidAt: new Date(),
      },
    });

    const phone = student.fatherPhone || student.motherPhone;
    if (phone) {
      await this.prisma.messageLog
        .create({
          data: {
            type: 'RECEIPT',
            recipient: phone,
            studentId: student.id,
            unitId: intent.unitId,
            payload: {
              receiptNo: next,
              amount,
              child: `${student.firstName} ${student.lastName}`,
              channel: 'RAZORPAY',
            },
          },
        })
        .catch((e: any) => this.log.warn(`Receipt message not queued: ${e?.message}`));
    }

    this.log.log(`Settled ${intent.orderId} → ${next} (₹${amount})`);
    return { transaction: txn, intent: updated };
  }
}

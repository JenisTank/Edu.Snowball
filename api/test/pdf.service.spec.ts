import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';

import { PdfService } from '../src/common/pdf/pdf.service';

const OUT = process.env.PDF_OUT_DIR ?? '/tmp';

describe('PDF documents (receipts + certificates)', () => {
  const svc = new PdfService();

  it('renders a fee receipt as a valid A4 PDF', async () => {
    const buf = await svc.receiptPdf({
      receiptNo: 'BB-U1-RCPT-2627-0042',
      paymentDate: '2026-10-21',
      studentName: 'Aarav Sample',
      admissionNo: 'BB-U1-2627-0001',
      programme: 'PlayHouse',
      batch: 'PlayHouse Morning (Guj)',
      unitName: 'Unit 1 - Saraswati',
      unitCode: 'U1',
      amount: 24000,
      discount: 600,
      paymentMode: 'UPI',
      reference: 'UPI/2026/99881',
      ledgerType: 'PRESCHOOL',
      collectedBy: 'Reception Hub',
    });
    fs.writeFileSync(`${OUT}/receipt.pdf`, buf);

    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);

    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595); // A4 portrait
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe('Fee receipt BB-U1-RCPT-2627-0042');
  });

  it('renders a certificate with wrapped body text', async () => {
    const longBody = Array.from(
      { length: 6 },
      () =>
        'This is to certify that the child has shown wonderful growth across all learning areas during the academic year.',
    ).join(' ');
    const buf = await svc.certificatePdf({
      serialNo: 'BB-U1-CERT-2627-0007',
      title: 'Bonafide Certificate',
      body: longBody,
      childName: 'Aarav Sample',
      admissionNo: 'BB-U1-2627-0001',
      programme: 'PlayHouse',
      unitName: 'Unit 1 - Saraswati',
      issuedAt: '2026-10-21',
    });
    fs.writeFileSync(`${OUT}/certificate.pdf`, buf);

    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain('Bonafide Certificate');
  });

  it('escapes rupee amounts as INR (PDF standard fonts are WinAnsi only)', async () => {
    const buf = await svc.receiptPdf({
      receiptNo: 'BB-U2-RCPT-2627-0001',
      paymentDate: '2026-04-10',
      studentName: 'Diya Sample',
      admissionNo: 'BB-U2-2627-0009',
      unitName: 'Unit 2 - Rajkot Flagship',
      unitCode: 'U2',
      amount: 125000.5,
      paymentMode: 'NEFT',
    });
    expect(buf.length).toBeGreaterThan(1000);
  });
});

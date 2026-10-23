import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * Server-side PDF generation for parent-facing documents.
 *
 * Deliberately browser-free: `pdf-lib` is pure JavaScript, so receipts and
 * certificates can be produced in a slim container with no Chromium. The
 * existing HTML `/print` endpoints stay for browser printing; these return a
 * real PDF for the parent document vault, WhatsApp/email attachments and
 * offline archiving.
 *
 * Only PDF standard fonts are embedded (Helvetica), so text is limited to
 * WinAnsi: rupee amounts are written as `INR 12,500` rather than `₹`.
 */

const HONEY = rgb(0.784, 0.573, 0.165); // #C8922A
const INK = rgb(0.122, 0.106, 0.075); // #1F1B13
const MUTED = rgb(0.42, 0.4, 0.37);
const CREAM = rgb(0.973, 0.929, 0.804); // #F8EDCD
const LINE = rgb(0.87, 0.8, 0.68);

export interface ReceiptData {
  receiptNo: string;
  paymentDate: Date | string;
  studentName: string;
  admissionNo: string;
  programme?: string | null;
  batch?: string | null;
  unitName: string;
  unitCode: string;
  amount: number;
  discount?: number;
  fine?: number;
  paymentMode: string;
  reference?: string | null;
  ledgerType?: string;
  collectedBy?: string | null;
}

export interface CertificateData {
  serialNo: string;
  title: string;
  body: string;
  childName: string;
  admissionNo: string;
  programme?: string | null;
  unitName: string;
  issuedAt: Date | string;
}

const inr = (n: number) =>
  'INR ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

@Injectable()
export class PdfService {
  private readonly logger = new Logger('PDF');

  /** Wrap text to a width, using the actual font metrics. */
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private header(page: PDFPage, bold: PDFFont, font: PDFFont, title: string, subtitle: string) {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: CREAM });
    page.drawText('BumbleB Kidz', { x: 48, y: height - 52, size: 20, font: bold, color: HONEY });
    page.drawText(subtitle, { x: 48, y: height - 72, size: 9, font, color: MUTED });
    page.drawText(title, {
      x: width - 48 - bold.widthOfTextAtSize(title, 13),
      y: height - 52,
      size: 13,
      font: bold,
      color: INK,
    });
  }

  private footer(page: PDFPage, font: PDFFont, serial: string) {
    const { width } = page.getSize();
    page.drawLine({
      start: { x: 48, y: 70 },
      end: { x: width - 48, y: 70 },
      thickness: 0.5,
      color: LINE,
    });
    page.drawText('Computer-generated document — no signature required.', {
      x: 48,
      y: 52,
      size: 8,
      font,
      color: MUTED,
    });
    const verify = `Verify: ${serial}`;
    page.drawText(verify, {
      x: width - 48 - font.widthOfTextAtSize(verify, 8),
      y: 52,
      size: 8,
      font,
      color: MUTED,
    });
  }

  private row(
    page: PDFPage,
    font: PDFFont,
    y: number,
    label: string,
    value: string,
    strong = false,
  ) {
    const { width } = page.getSize();
    if (strong) {
      page.drawRectangle({ x: 48, y: y - 6, width: width - 96, height: 26, color: CREAM });
    }
    page.drawText(label, { x: 60, y, size: 10, font, color: strong ? INK : MUTED });
    const text = value;
    page.drawText(text, {
      x: width - 60 - font.widthOfTextAtSize(text, 10),
      y,
      size: 10,
      font,
      color: INK,
    });
  }

  /**
   * WinAnsi-safe text. PDF standard fonts cannot encode the rupee sign, the
   * em dash or the middle dot, and pdf-lib throws rather than substituting, so
   * every string bound for a PDF passes through here first.
   */
  private ansi(text: string): string {
    return String(text ?? '')
      .replace(/₹/g, 'INR ')
      .replace(/[—–]/g, '-')
      .replace(/[·•]/g, '-')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\x20-\x7E\n]/g, '');
  }

  /**
   * Generic flowing text document (weekly digest, notes, letters). Kept
   * deliberately simple: one column, automatic pagination, no layout language.
   */
  async textPdf(data: { title: string; subtitle: string; body: string }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(this.ansi(data.title));
    doc.setProducer('BumbleB Kidz ERP');
    doc.setCreationDate(new Date());

    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const size = 10.5;
    const leading = 16;

    let page = doc.addPage([595, 842]);
    const { width, height } = page.getSize();
    this.header(page, bold, font, this.ansi(data.title), this.ansi(data.subtitle));

    let y = height - 130;
    const bottom = 90;

    for (const block of this.ansi(data.body).split('\n')) {
      if (!block.trim()) {
        y -= leading * 0.5;
        continue;
      }
      for (const line of this.wrap(block, font, size, width - 96)) {
        if (y < bottom) {
          this.footer(page, font, 'BumbleB Kidz');
          page = doc.addPage([595, 842]);
          y = height - 90;
        }
        page.drawText(line, { x: 48, y, size, font, color: INK });
        y -= leading;
      }
    }

    this.footer(page, font, 'BumbleB Kidz');
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  async receiptPdf(data: ReceiptData): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Fee receipt ${data.receiptNo}`);
    doc.setProducer('BumbleB Kidz ERP');
    doc.setCreationDate(new Date());

    const page = doc.addPage([595, 842]); // A4
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();

    this.header(page, bold, font, 'FEE RECEIPT', data.unitName);

    page.drawText(data.receiptNo, { x: 48, y: height - 130, size: 16, font: bold, color: INK });
    page.drawText(`Date: ${fmtDate(data.paymentDate)}`, {
      x: width - 48 - font.widthOfTextAtSize(`Date: ${fmtDate(data.paymentDate)}`, 10),
      y: height - 128,
      size: 10,
      font,
      color: MUTED,
    });

    let y = height - 170;
    page.drawText(data.studentName, { x: 48, y, size: 14, font: bold, color: INK });
    y -= 18;
    const meta = [data.admissionNo, data.programme, data.batch].filter(Boolean).join('  ·  ');
    page.drawText(meta, { x: 48, y, size: 10, font, color: MUTED });

    y -= 40;
    page.drawLine({ start: { x: 48, y }, end: { x: width - 48, y }, thickness: 0.5, color: LINE });

    y -= 30;
    this.row(page, font, y, 'Fee received', inr(data.amount));
    if (data.discount) {
      y -= 26;
      this.row(page, font, y, 'Discount applied', inr(data.discount));
    }
    if (data.fine) {
      y -= 26;
      this.row(page, font, y, 'Fine', inr(data.fine));
    }
    y -= 26;
    this.row(page, font, y, 'Payment mode', data.paymentMode);
    if (data.reference) {
      y -= 26;
      this.row(page, font, y, 'Reference', data.reference);
    }
    if (data.ledgerType) {
      y -= 26;
      this.row(page, font, y, 'Ledger', data.ledgerType);
    }
    if (data.collectedBy) {
      y -= 26;
      this.row(page, font, y, 'Collected by', data.collectedBy);
    }

    y -= 44;
    this.row(page, font, y, 'Amount received', inr(data.amount), true);

    y -= 60;
    page.drawText('Thank you for your payment.', { x: 48, y, size: 10, font: bold, color: HONEY });

    this.footer(page, font, `${data.unitCode} · ${data.receiptNo}`);
    const bytes = await doc.save();
    this.logger.log(`receipt PDF generated: ${data.receiptNo} (${bytes.length} bytes)`);
    return Buffer.from(bytes);
  }

  async certificatePdf(data: CertificateData): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(`${data.title} — ${data.serialNo}`);
    doc.setProducer('BumbleB Kidz ERP');

    const page = doc.addPage([595, 842]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 24,
      y: 24,
      width: width - 48,
      height: height - 48,
      borderColor: HONEY,
      borderWidth: 2,
    });
    page.drawRectangle({
      x: 32,
      y: 32,
      width: width - 64,
      height: height - 64,
      borderColor: LINE,
      borderWidth: 0.5,
    });

    this.header(page, bold, font, 'CERTIFICATE', data.unitName);

    let y = height - 220;
    const titleWidth = bold.widthOfTextAtSize(data.title.toUpperCase(), 22);
    page.drawText(data.title.toUpperCase(), {
      x: (width - titleWidth) / 2,
      y,
      size: 22,
      font: bold,
      color: HONEY,
    });

    y -= 50;
    const childWidth = bold.widthOfTextAtSize(data.childName, 18);
    page.drawText(data.childName, {
      x: (width - childWidth) / 2,
      y,
      size: 18,
      font: bold,
      color: INK,
    });

    y -= 22;
    const meta = [data.admissionNo, data.programme].filter(Boolean).join('  ·  ');
    page.drawText(meta, {
      x: (width - font.widthOfTextAtSize(meta, 10)) / 2,
      y,
      size: 10,
      font,
      color: MUTED,
    });

    // Body copy, wrapped and centred in a column.
    y -= 46;
    const columnWidth = width - 160;
    const lines = this.wrap(data.body, font, 11.5, columnWidth);
    for (const line of lines) {
      page.drawText(line, {
        x: 80,
        y,
        size: 11.5,
        font,
        color: INK,
        lineHeight: 17,
      });
      y -= 17;
    }

    y -= 60;
    page.drawLine({ start: { x: 80, y }, end: { x: 250, y }, thickness: 0.5, color: MUTED });
    page.drawText('Centre Head', { x: 80, y: y - 14, size: 9, font, color: MUTED });
    page.drawLine({
      start: { x: width - 250, y },
      end: { x: width - 80, y },
      thickness: 0.5,
      color: MUTED,
    });
    page.drawText(`Issued ${fmtDate(data.issuedAt)}`, {
      x: width - 250,
      y: y - 14,
      size: 9,
      font,
      color: MUTED,
    });

    this.footer(page, font, data.serialNo);
    const bytes = await doc.save();
    this.logger.log(`certificate PDF generated: ${data.serialNo} (${bytes.length} bytes)`);
    return Buffer.from(bytes);
  }
}

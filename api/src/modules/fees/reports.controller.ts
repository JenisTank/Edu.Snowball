import { BadRequestException, Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { HO_ROLES } from '../../common/auth/auth.constants';
import { unitScope } from '../../common/auth/unit-scope';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ACADEMIC_YEAR, buildLedger, buildSchedule } from './fees.rules';
import {
  addonRegister,
  cancellationRows,
  collectionTotals,
  dailyCollection,
  dayBook,
  discountRows,
  feeStatusRows,
  headWiseRows,
  inr,
  liveReceipts,
  monthlyCollection,
  num,
  outstandingRows,
  paymentModeAnalysis,
  programmeRevenue,
  REPORT_CATALOGUE,
  reportFilename,
  tallyExport,
  toCsv,
  unitWiseRows,
  type LedgerRowLike,
} from './reports.rules';

/**
 * The 14 fee reports required by the spec (Section 10, Fees).
 *
 * Every report is available as JSON (for the screen) and `?format=csv` (for
 * the accountant). The aggregations live in reports.rules.ts and are unit
 * tested; this file only loads data and renders.
 */

const AY = ACADEMIC_YEAR;
const todayISO = () => new Date().toISOString().slice(0, 10);

@Controller('fees/reports')
@UseGuards(AuthGuard)
export class FeeReportsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Catalogue — the UI renders the picker from this. */
  @Get()
  index() {
    return REPORT_CATALOGUE;
  }

  // ── shared loader ──
  private async load(req: any, unitId?: string) {
    const scope = unitScope(req.user, unitId);
    const [students, structures, receipts, addons] = await Promise.all([
      this.prisma.student.findMany({
        where: { status: { in: ['ACTIVE', 'REGISTERED', 'TC_ISSUED'] }, ...scope },
        include: {
          programme: { select: { name: true } },
          unit: { select: { code: true, name: true } },
          feeTransactions: true,
        },
        orderBy: { admissionNo: 'asc' },
      }),
      this.prisma.feeStructure.findMany({
        where: { academicYear: AY },
        include: { unit: { select: { code: true } }, programme: { select: { name: true } } },
      }),
      this.prisma.feeTransaction.findMany({
        where: scope,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNo: true,
              programme: { select: { name: true } },
              unit: { select: { code: true } },
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.feeAddon.findMany({
        where: scope,
        include: {
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
        orderBy: { billedAt: 'desc' },
      }),
    ]);

    const sMap = new Map<string, any>(
      structures.map((f: any) => [`${f.unitId}:${f.programmeId}`, f]),
    );
    const rows: LedgerRowLike[] = students.map((s: any) => {
      const structure = sMap.get(`${s.unitId}:${s.programmeId}`);
      const plan = s.instalmentPlan ?? 'PLAN_C';
      const ledger = buildLedger(
        buildSchedule(structure, plan, !!s.siblingGroup),
        plan,
        s.feeTransactions,
        todayISO(),
      );
      return {
        id: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`,
        unit: s.unit.code,
        programme: s.programme,
        plan,
        gross: ledger.gross,
        discount: ledger.discount,
        net: ledger.net,
        paid: ledger.paid,
        balance: ledger.balance,
        overdue: ledger.overdue,
        sibling: !!s.siblingGroup,
        instalments: ledger.instalments,
      };
    });

    return { rows, receipts, addons, scope, students };
  }

  private scopeLabel(req: any, unitId?: string) {
    if (!HO_ROLES.includes(req.user.role)) return `unit-${req.user.unitId?.slice(0, 8) ?? 'own'}`;
    return unitId ? `unit-${unitId.slice(0, 8)}` : 'all-units';
  }

  /**
   * Render a report. `format=csv` streams a download and is audited, because
   * family financial data leaving the system is a reportable event.
   */
  private async deliver(
    req: any,
    res: Response,
    opts: {
      key: string;
      unitId?: string;
      format?: string;
      csvRows: Record<string, unknown>[];
      payload: unknown;
      title: string;
      summary?: Record<string, unknown>;
    },
  ) {
    if (opts.format === 'csv') {
      const csv = toCsv(opts.csvRows);
      await this.audit.log(req, 'fee_reports', opts.key, 'INSERT', null, {
        report: opts.key,
        rows: opts.csvRows.length,
        unitId: opts.unitId ?? 'ALL',
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${reportFilename(opts.key, this.scopeLabel(req, opts.unitId), todayISO())}"`,
      );
      return res.send('\uFEFF' + csv); // BOM so Excel opens ₹ columns correctly
    }
    return res.json({
      report: opts.key,
      title: opts.title,
      generatedAt: new Date(),
      ...(opts.payload as object),
    });
  }

  // ── 1. Daily collection ──
  @Get('daily-collection')
  async dailyCollection(
    @Req() req: any,
    @Res() res: Response,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { receipts } = await this.load(req, unitId);
    const range = date ? { from: date, to: date } : { from, to };
    const live = liveReceipts(receipts, range);
    const days = dailyCollection(receipts.filter((r: any) => (date ? true : true)));
    const within = days.filter(
      (d) => (!range.from || d.date >= range.from) && (!range.to || d.date <= range.to),
    );
    return this.deliver(req, res, {
      key: 'daily-collection',
      unitId,
      format,
      title: 'Daily Collection',
      payload: {
        range: { from: range.from ?? null, to: range.to ?? null },
        days: within,
        totals: collectionTotals(live),
      },
      csvRows: live.map((r: any) => ({
        date: String(r.paymentDate).slice(0, 10),
        receiptNo: r.receiptNo,
        admissionNo: r.student?.admissionNo ?? '',
        student: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
        mode: r.paymentMode,
        ledger: r.ledgerType,
        amount: num(r.amount),
        reference: r.reference ?? '',
      })),
    });
  }

  // ── 2. Day book ──
  @Get('day-book')
  async dayBook(
    @Req() req: any,
    @Res() res: Response,
    @Query('date') date?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const d = date || todayISO();
    const { receipts } = await this.load(req, unitId);
    const book = dayBook(receipts, d);
    return this.deliver(req, res, {
      key: 'day-book',
      unitId,
      format,
      title: `Day Book — ${d}`,
      payload: {
        ...book,
        received: book.received.map((r: any) => ({
          receiptNo: r.receiptNo,
          student: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          admissionNo: r.student?.admissionNo ?? '',
          mode: r.paymentMode,
          amount: num(r.amount),
        })),
        cancelled: book.cancelled.map((r: any) => ({
          receiptNo: r.receiptNo,
          student: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          mode: r.paymentMode,
          amount: num(r.amount),
          remarks: r.remarks ?? null,
        })),
      },
      csvRows: [
        ...book.received.map((r: any) => ({
          date: d,
          type: 'RECEIPT',
          receiptNo: r.receiptNo,
          admissionNo: r.student?.admissionNo ?? '',
          student: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          mode: r.paymentMode,
          amount: num(r.amount),
        })),
        ...book.cancelled.map((r: any) => ({
          date: d,
          type: 'CANCELLED',
          receiptNo: r.receiptNo,
          admissionNo: r.student?.admissionNo ?? '',
          student: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
          mode: r.paymentMode,
          amount: -num(r.amount),
        })),
      ],
    });
  }

  // ── 3. Monthly collection ──
  @Get('monthly-collection')
  async monthly(
    @Req() req: any,
    @Res() res: Response,
    @Query('year') year?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const y = Number(year) || new Date().getFullYear();
    const { receipts } = await this.load(req, unitId);
    const months = monthlyCollection(receipts, y);
    return this.deliver(req, res, {
      key: 'monthly-collection',
      unitId,
      format,
      title: `Monthly Collection — ${y}`,
      payload: { year: y, months, total: months.reduce((s, m) => s + m.total, 0) },
      csvRows: months.map((m) => ({ year: y, month: m.label, receipts: m.count, amount: m.total })),
    });
  }

  // ── 4. Payment mode analysis ──
  @Get('payment-mode')
  async paymentMode(
    @Req() req: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { receipts } = await this.load(req, unitId);
    const rows = paymentModeAnalysis(receipts, { from, to });
    return this.deliver(req, res, {
      key: 'payment-mode',
      unitId,
      format,
      title: 'Payment Mode Analysis',
      payload: { range: { from: from ?? null, to: to ?? null }, modes: rows },
      csvRows: rows.map((r) => ({
        mode: r.mode,
        receipts: r.count,
        amount: r.amount,
        sharePct: r.sharePct,
      })),
    });
  }

  // ── 5. Outstanding ──
  @Get('outstanding')
  async outstanding(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { rows } = await this.load(req, unitId);
    const result = outstandingRows(rows, todayISO());
    return this.deliver(req, res, {
      key: 'outstanding',
      unitId,
      format,
      title: 'Outstanding Fees',
      payload: result,
      csvRows: result.rows.map((r) => ({
        admissionNo: r.admissionNo,
        student: r.name,
        unit: r.unit ?? '',
        programme: r.programme?.name ?? '',
        plan: r.plan ?? '',
        net: r.net,
        paid: r.paid,
        balance: r.balance,
        overdue: r.overdue,
        daysOverdue: r.daysOverdue,
        bucket: r.bucket,
      })),
    });
  }

  // ── 6. Fee status per student ──
  @Get('fee-status')
  async feeStatus(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { rows } = await this.load(req, unitId);
    const result = feeStatusRows(rows);
    return this.deliver(req, res, {
      key: 'fee-status',
      unitId,
      format,
      title: 'Fee Status per Student',
      payload: result,
      csvRows: result.rows.map((r) => ({
        admissionNo: r.admissionNo,
        student: r.name,
        unit: r.unit ?? '',
        programme: r.programme ?? '',
        plan: r.plan ?? '',
        net: r.net,
        paid: r.paid,
        balance: r.balance,
        status: r.status,
      })),
    });
  }

  // ── 7. Discount & concession ──
  @Get('discounts')
  async discounts(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { rows, receipts } = await this.load(req, unitId);
    const result = discountRows(rows, receipts);
    return this.deliver(req, res, {
      key: 'discounts',
      unitId,
      format,
      title: 'Discount & Concession',
      payload: result,
      csvRows: [
        ...result.concessions.map((c) => ({
          kind: c.kind,
          admissionNo: c.admissionNo,
          student: c.name,
          reference: '',
          amount: c.amount,
          note: c.note,
        })),
        ...result.manual.map((c) => ({
          kind: c.kind,
          admissionNo: c.admissionNo,
          student: c.name,
          reference: c.receiptNo,
          amount: c.amount,
          note: c.note ?? '',
        })),
        ...result.fines.map((c) => ({
          kind: c.kind,
          admissionNo: c.admissionNo,
          student: c.name,
          reference: c.receiptNo,
          amount: c.amount,
          note: c.note,
        })),
      ],
    });
  }

  // ── 8. Cancellations ──
  @Get('cancellations')
  async cancellations(
    @Req() req: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { receipts } = await this.load(req, unitId);
    const result = cancellationRows(receipts, { from, to });
    return this.deliver(req, res, {
      key: 'cancellations',
      unitId,
      format,
      title: 'Cancellation & Refund Log',
      payload: result,
      csvRows: result.rows.map((r) => ({
        date: r.date,
        receiptNo: r.receiptNo,
        admissionNo: r.admissionNo,
        student: r.name,
        mode: r.mode,
        amount: r.amount,
        remarks: r.remarks ?? '',
      })),
    });
  }

  // ── 9. Fee structure master ──
  @Get('structure-master')
  async structureMaster(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const structures = await this.prisma.feeStructure.findMany({
      where: {
        academicYear: AY,
        ...(HO_ROLES.includes(req.user.role)
          ? unitId
            ? { unitId }
            : {}
          : { unitId: req.user.unitId }),
      },
      include: { unit: { select: { code: true } }, programme: { select: { name: true } } },
      orderBy: [{ unitId: 'asc' }, { programmeId: 'asc' }],
    });
    const rows = structures.map((f: any) => ({
      unit: f.unit.code,
      programme: f.programme.name,
      academicYear: f.academicYear,
      totalFee: num(f.totalFee),
      instalment1: num(f.instalment1),
      instalment2: num(f.instalment2),
      instalment3: num(f.instalment3),
      siblingDiscountPct: num(f.siblingDiscountPct),
      locked: f.locked,
    }));
    return this.deliver(req, res, {
      key: 'structure-master',
      unitId,
      format,
      title: 'Fee Structure Master',
      payload: { academicYear: AY, rows, count: rows.length },
      csvRows: rows,
    });
  }

  // ── 10. Programme-wise revenue ──
  @Get('programme-revenue')
  async programmeRevenue(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { rows } = await this.load(req, unitId);
    const result = programmeRevenue(rows);
    return this.deliver(req, res, {
      key: 'programme-revenue',
      unitId,
      format,
      title: 'Programme-wise Revenue',
      payload: { programmes: result },
      csvRows: result,
    });
  }

  // ── 11. Unit-wise (HO) ──
  @Get('unit-wise')
  @Roles('FOUNDER', 'ACADEMIC_DIR')
  async unitWise(
    @Req() req: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    const { rows, receipts } = await this.load(req);
    const result = unitWiseRows(rows, receipts, { from, to });
    return this.deliver(req, res, {
      key: 'unit-wise',
      format,
      title: 'Unit-wise Collection',
      payload: result,
      csvRows: result.units.map((u) => ({
        unit: u.unit,
        students: u.students,
        billed: u.billed,
        collected: u.collected,
        outstanding: u.outstanding,
      })),
    });
  }

  // ── 12. Head-wise summary ──
  @Get('head-wise')
  async headWise(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { rows, receipts, addons } = await this.load(req, unitId);
    const heads = headWiseRows(rows, receipts, addons);
    return this.deliver(req, res, {
      key: 'head-wise',
      unitId,
      format,
      title: 'Head-wise Summary',
      payload: { heads, formatted: heads.map((h) => ({ ...h, display: inr(h.amount) })) },
      csvRows: heads,
    });
  }

  // ── 13. Add-on fees ──
  @Get('addons')
  async addonsReport(
    @Req() req: any,
    @Res() res: Response,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { addons } = await this.load(req, unitId);
    const result = addonRegister(addons);
    return this.deliver(req, res, {
      key: 'addons',
      unitId,
      format,
      title: 'Add-on Fees',
      payload: result,
      csvRows: result.rows.map((r) => ({
        billedAt: r.billedAt,
        admissionNo: r.admissionNo,
        student: r.name,
        label: r.label,
        ledger: r.ledgerType,
        amount: r.amount,
        status: r.status,
        reference: r.reference ?? '',
      })),
    });
  }

  // ── 14. Accounting export (Tally) ──
  @Get('tally-export')
  @Roles('FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD')
  async tally(
    @Req() req: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
    @Query('format') format?: string,
  ) {
    const { receipts } = await this.load(req, unitId);
    const result = tallyExport(receipts, { from, to });
    if (format !== 'csv') {
      // A JSON preview keeps the endpoint usable from the UI without a download.
      return res.json({
        report: 'tally-export',
        title: 'Accounting Export (Tally)',
        count: result.rows.length,
        total: result.total,
        preview: result.rows.slice(0, 20),
      });
    }
    return this.deliver(req, res, {
      key: 'tally-export',
      unitId,
      format,
      title: 'Accounting Export (Tally)',
      payload: { count: result.rows.length },
      csvRows: result.rows,
    });
  }
}

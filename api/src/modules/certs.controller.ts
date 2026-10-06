import {
  Body, Controller, Get, Header, Module, Param, Post, Query, Req, UseGuards,
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthGuard, Roles, unitScope, HO_ROLES } from '../auth/auth';
import { PrismaService } from '../prisma.service';
import { AuditService } from './admin.controller';

const AY = '2026-27';
const AY_SHORT = '2627';
const ISSUE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'];

// ── The 7 HO-locked certificate templates (spec) ──
// Wording is locked at Head Office; units can only fill variable fields.
export const TEMPLATES = [
  { type: 'BONAFIDE', name: 'Bonafide Certificate', icon: '🏫', body: 'This is to certify that {child} ({admissionNo}) is a bonafide student of BumbleB Kidz, {unit}, enrolled in the {programme} programme for the Academic Year {ay}.' },
  { type: 'PROGRESS', name: 'Progress Certificate', icon: '🌱', body: 'This is to certify that {child} has shown wonderful growth in the {programme} programme during AY {ay}. {child} is making joyful, steady progress across all learning areas.' }, // verbal only — never numeric
  { type: 'PARTICIPATION', name: 'Participation Certificate', icon: '🎉', body: 'Awarded to {child} for enthusiastic participation in {event} held at BumbleB Kidz, {unit}.' },
  { type: 'APPRECIATION', name: 'Appreciation Certificate', icon: '⭐', body: 'Presented to {child} in appreciation of {reason}. We are proud of you, little bee!' },
  { type: 'CHARACTER', name: 'Character Certificate', icon: '🤝', body: 'This is to certify that {child} ({admissionNo}) bears a good moral character and has been a kind, cheerful member of the BumbleB Kidz family during their time with us.' },
  { type: 'GRADUATION', name: 'Graduation Certificate', icon: '🎓', body: 'This certifies that {child} has successfully completed the {programme} programme at BumbleB Kidz, {unit}, and is ready for the next exciting step of their learning journey.' },
  { type: 'TC', name: 'Transfer Certificate', icon: '📜', body: 'This is to certify that {child} ({admissionNo}), enrolled in the {programme} programme, has been relieved from BumbleB Kidz, {unit}, on {date}. All dues are cleared and we wish {child} the very best.' },
];

@Controller('certificates')
@UseGuards(AuthGuard)
export class CertificatesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get('templates')
  templates() {
    return TEMPLATES.map(t => ({ ...t, locked: true })); // wording HO-locked
  }

  @Get()
  list(@Req() req: any, @Query('unitId') unitId?: string) {
    return this.prisma.certificate.findMany({
      where: { student: unitScope(req.user, unitId) },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true, unit: { select: { code: true } } } } },
      orderBy: { issuedAt: 'desc' }, take: 200,
    });
  }

  // ── Issue a certificate ──
  @Post('issue')
  @Roles(...ISSUE_ROLES)
  async issue(@Req() req: any, @Body() b: { studentId: string; type: string; event?: string; reason?: string; noDuesConfirmed?: boolean }) {
    const tpl = TEMPLATES.find(t => t.type === b.type);
    if (!tpl) throw new BadRequestException('Unknown certificate type');
    const s = await this.prisma.student.findUnique({
      where: { id: b.studentId },
      include: { programme: true, unit: true, feeTransactions: true },
    });
    if (!s) throw new NotFoundException('Student not found');
    if (!HO_ROLES.includes(req.user.role) && req.user.unitId !== s.unitId) throw new ForbiddenException('Cross-unit access denied');

    // ── TC gate (spec): fees fully cleared + explicit No-Dues confirmation ──
    if (b.type === 'TC') {
      const structure = await this.prisma.feeStructure.findUnique({
        where: { unitId_programmeId_academicYear: { unitId: s.unitId, programmeId: s.programmeId, academicYear: AY } },
      });
      const gross = Number(structure?.totalFee ?? 0);
      const disc = s.siblingGroup ? Math.round(gross * Number(structure?.siblingDiscountPct ?? 0) / 100) : 0;
      const net = gross - disc;
      const paid = s.feeTransactions.filter(t => !t.isCancelled && t.ledgerType === 'PRESCHOOL').reduce((a, t) => a + Number(t.amount), 0);
      if (paid < net) throw new BadRequestException(`TC blocked: ₹${(net - paid).toLocaleString('en-IN')} fees pending. Clear the ledger first.`);
      if (!b.noDuesConfirmed) throw new BadRequestException('TC requires No-Dues confirmation (library, kit, transport).');
    }

    const prefix = `BB-${s.unit.code}-CERT-${AY_SHORT}-`;
    const last = await this.prisma.certificate.findFirst({ where: { serialNo: { startsWith: prefix } }, orderBy: { serialNo: 'desc' } });
    const serial = last ? parseInt(last.serialNo.slice(prefix.length), 10) + 1 : 1;
    const serialNo = `${prefix}${String(serial).padStart(4, '0')}`;

    const cert = await this.prisma.certificate.create({
      data: {
        studentId: s.id, type: b.type, serialNo, issuedById: req.user.sub,
        payload: { event: b.event ?? null, reason: b.reason ?? null, ay: AY },
      },
    });
    if (b.type === 'TC') {
      await this.prisma.student.update({ where: { id: s.id }, data: { status: 'TC_ISSUED' } });
    }
    await this.audit.log(req, 'certificates', cert.id, 'CREATE', null, cert);
    return cert;
  }

  // ── Printable certificate ──
  @Get(':id/print')
  @Header('Content-Type', 'text/html')
  async print(@Req() req: any, @Param('id') id: string) {
    const c = await this.prisma.certificate.findUnique({
      where: { id },
      include: { student: { include: { programme: true, unit: true } } },
    });
    if (!c) throw new NotFoundException('Certificate not found');
    const tpl = TEMPLATES.find(t => t.type === c.type)!;
    const s = c.student;
    const p: any = c.payload ?? {};
    const child = `${s.firstName} ${s.lastName}`;
    const body = tpl.body
      .replaceAll('{child}', child).replaceAll('{admissionNo}', s.admissionNo)
      .replaceAll('{programme}', s.programme.name).replaceAll('{unit}', s.unit.name)
      .replaceAll('{ay}', AY).replaceAll('{event}', p.event ?? 'the school event')
      .replaceAll('{reason}', p.reason ?? 'their wonderful spirit')
      .replaceAll('{date}', new Date(c.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }));
    return `<!doctype html><html><head><meta charset="utf-8"><title>${c.serialNo}</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Georgia,'Times New Roman',serif;background:#faf7ef;display:flex;justify-content:center;padding:40px;color:#1F1B13}
      .cert{width:860px;background:#fffdf6;border:3px solid #C8922A;border-radius:6px;padding:14px;box-shadow:0 8px 40px rgba(31,27,19,.12)}
      .inner{border:1.5px solid #DCA93C;border-radius:3px;padding:52px 64px;text-align:center;background:
        radial-gradient(circle at 0 0,rgba(220,169,60,.07),transparent 40%),
        radial-gradient(circle at 100% 100%,rgba(75,174,208,.07),transparent 40%)}
      .brand{font-size:30px;font-weight:700;color:#8A6410;letter-spacing:.02em}
      .sub{font-size:11px;letter-spacing:.35em;text-transform:uppercase;color:#6b5a2e;margin-top:4px}
      .title{font-size:21px;letter-spacing:.3em;text-transform:uppercase;color:#4BAED0;margin:34px 0 6px;font-weight:700}
      .rule{width:120px;height:2px;background:linear-gradient(90deg,transparent,#DCA93C,transparent);margin:0 auto 30px}
      .name{font-size:40px;color:#1F1B13;font-style:italic;margin:16px 0}
      .body{font-size:15.5px;line-height:1.85;color:#44403c;max-width:620px;margin:0 auto}
      .foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:56px;font-size:12px;color:#57534e}
      .sig{border-top:1px solid #a8a29e;padding-top:6px;width:190px;text-align:center}
      .serial{font-family:monospace;font-size:11px;color:#78716c;margin-top:28px}
      @media print{body{padding:0;background:#fff}.cert{box-shadow:none}}
    </style></head><body><div class="cert"><div class="inner">
      <div class="brand">🐝 BumbleB Kidz</div>
      <div class="sub">${s.unit.name} · Where little bees bloom</div>
      <div class="title">${tpl.name}</div><div class="rule"></div>
      <div style="font-size:13px;color:#78716c">proudly presented to</div>
      <div class="name">${child}</div>
      <p class="body">${body}</p>
      <div class="foot">
        <div class="sig">Centre Head</div>
        <div style="text-align:center;font-size:11px">Issued ${new Date(c.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div class="sig">Founder — BumbleB Kidz</div>
      </div>
      <div class="serial">${c.serialNo} · verify at erp.bumblebkidz.com</div>
    </div></div><script>setTimeout(()=>window.print&&window.print(),400)</script></body></html>`;
  }
}

@Module({ controllers: [CertificatesController], providers: [PrismaService, AuditService] })
export class CertificatesModule {}

import { CertificatesController } from '../src/modules/certificates/certificates.controller';

/** The HO-locked template wording must render identically for print and PDF. */
function makeController() {
  const prisma = {} as any;
  const audit = {} as any;
  const pdf = {} as any;
  return new CertificatesController(prisma, audit, pdf);
}

const certificate = {
  type: 'BONAFIDE',
  serialNo: 'BB-U1-CERT-2627-0007',
  issuedAt: '2026-10-21',
  payload: {},
  student: {
    firstName: 'Aarav',
    lastName: 'Sample',
    admissionNo: 'BB-U1-2627-0001',
    programme: { name: 'PlayHouse' },
    unit: { name: 'Unit 1 - Saraswati' },
  },
};

describe('certificate body rendering', () => {
  it('substitutes every placeholder in the HO-locked template', () => {
    const { body, child, tpl } = (makeController() as any).renderCertificateBody(certificate);
    expect(child).toBe('Aarav Sample');
    expect(tpl.name).toBe('Bonafide Certificate');
    expect(body).toContain('Aarav Sample');
    expect(body).toContain('BB-U1-2627-0001');
    expect(body).toContain('PlayHouse');
    expect(body).toContain('Unit 1 - Saraswati');
    expect(body).toContain('2026-27');
    expect(body).not.toMatch(/\{\w+\}/); // no unresolved placeholders
  });

  it('uses the event and reason payload for event certificates', () => {
    const participation = {
      ...certificate,
      type: 'PARTICIPATION',
      payload: { event: 'Annual Day 2026' },
    };
    const { body } = (makeController() as any).renderCertificateBody(participation);
    expect(body).toContain('Annual Day 2026');
  });

  it.each(['NO_DUES', 'FEE_STATEMENT', 'ADMISSION_CONFIRMATION'])(
    'renders the %s document with live figures and no unresolved placeholder',
    (type) => {
      const doc = {
        ...certificate,
        type,
        payload: {
          net: 108000,
          paid: 108000,
          balance: 0,
          plan: 'PLAN_A',
          batch: 'K1 Morning Gujarati',
          orientationDate: '2026-06-05',
          instalments: ['1) 10 Apr ₹36,000', '2) 10 Jul ₹36,000', '3) 10 Oct ₹36,000'],
        },
      };
      const { body } = (makeController() as any).renderCertificateBody(doc);
      expect(body).not.toMatch(/\{\w+\}/);
      if (type !== 'NO_DUES') {
        // A No-Dues letter deliberately carries no money figures.
        expect(body).toContain('1,08,000');
        expect(body).toContain('Plan A');
      }
    },
  );

  it('falls back gracefully when a document has no orientation date', () => {
    const doc = {
      ...certificate,
      type: 'ADMISSION_CONFIRMATION',
      payload: { net: 1, paid: 0, balance: 1 },
    };
    const { body } = (makeController() as any).renderCertificateBody(doc);
    expect(body).toContain('to be announced');
    expect(body).toContain('to be allocated');
  });
});

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
    lastName: 'Patel',
    admissionNo: 'BB-U1-2627-0001',
    programme: { name: 'PlayHouse' },
    unit: { name: 'Unit 1 - Saraswati' },
  },
};

describe('certificate body rendering', () => {
  it('substitutes every placeholder in the HO-locked template', () => {
    const { body, child, tpl } = (makeController() as any).renderCertificateBody(certificate);
    expect(child).toBe('Aarav Patel');
    expect(tpl.name).toBe('Bonafide Certificate');
    expect(body).toContain('Aarav Patel');
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
});

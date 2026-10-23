import {
  anonymisedStudent,
  consentRegister,
  cutoff,
  DEFAULT_RETENTION,
  ERASURE_FIELDS,
  latestConsents,
  retentionPlan,
} from '../src/modules/privacy/privacy.rules';
import { decryptField, encryptField, isEncrypted, maskPan } from '../src/common/crypto/pii.service';

describe('DPDP compliance', () => {
  describe('consent register', () => {
    const row = (type: string, granted: boolean, at: string) => ({
      consentType: type,
      granted,
      grantedBy: 'Parent',
      grantedAt: at,
    });

    it('keeps the latest decision per consent type', () => {
      const latest = latestConsents([
        row('PHOTO_VIDEO', true, '2026-04-01T00:00:00Z'),
        row('PHOTO_VIDEO', false, '2026-09-01T00:00:00Z'),
        row('DATA_PROCESSING', true, '2026-04-01T00:00:00Z'),
      ]);
      expect(latest.PHOTO_VIDEO.granted).toBe(false);
      expect(latest.DATA_PROCESSING.granted).toBe(true);
    });

    it('reports a missing mandatory consent as not satisfied', () => {
      const reg = consentRegister([row('PHOTO_VIDEO', true, '2026-04-01T00:00:00Z')]);
      expect(reg.mandatorySatisfied).toBe(false);
      expect(reg.missing).toContain('DATA_PROCESSING');
    });

    it('flags an active refusal separately from a missing decision', () => {
      const reg = consentRegister([
        row('DATA_PROCESSING', true, '2026-04-01T00:00:00Z'),
        row('PHOTO_VIDEO', false, '2026-04-02T00:00:00Z'),
      ]);
      expect(reg.mandatorySatisfied).toBe(true);
      expect(reg.declined).toEqual(['PHOTO_VIDEO']);
      expect(reg.missing).not.toContain('PHOTO_VIDEO');
    });

    it('orders history newest first for the auditor', () => {
      const reg = consentRegister([
        row('DATA_PROCESSING', true, '2026-04-01T00:00:00Z'),
        row('DATA_PROCESSING', false, '2026-09-01T00:00:00Z'),
      ]);
      expect(new Date(reg.history[0].grantedAt).getUTCMonth()).toBe(8); // September
    });
  });

  describe('retention', () => {
    it('computes a cutoff in the past', () => {
      const now = new Date('2026-10-22T00:00:00Z');
      expect(cutoff(30, now).toISOString()).toBe('2026-09-22T00:00:00.000Z');
      expect(cutoff(365, now).toISOString()).toBe('2025-10-22T00:00:00.000Z');
    });

    it('uses the documented defaults (2y messages, 7y audit)', () => {
      const plan = retentionPlan({}, new Date('2026-10-22T00:00:00Z'));
      expect(plan.policy).toEqual(DEFAULT_RETENTION);
      expect(plan.messageBefore.toISOString()).toBe('2024-10-22T00:00:00.000Z');
      expect(plan.auditBefore.getUTCFullYear()).toBe(2019);
    });

    it('lets a stored policy override a default without dropping the rest', () => {
      const plan = retentionPlan({ messageDays: 90 }, new Date('2026-10-22T00:00:00Z'));
      expect(plan.policy.messageDays).toBe(90);
      expect(plan.policy.auditDays).toBe(DEFAULT_RETENTION.auditDays);
    });
  });

  describe('erasure', () => {
    it('clears every identifying field but keeps the birth year', () => {
      const out = anonymisedStudent({ dob: '2020-07-15' }, new Date('2026-10-22T00:00:00Z'));
      expect(out.firstName).toBe('Erased');
      expect(out.fatherPhone).toBeNull();
      expect(out.guardianEmail).toBeNull();
      expect(out.bloodGroup).toBeNull();
      expect(new Date(out.dob).getUTCFullYear()).toBe(2020);
      expect(out.anonymisedAt).toEqual(new Date('2026-10-22T00:00:00Z'));
      for (const f of ERASURE_FIELDS) expect(f in out).toBe(true);
    });

    it('leaves the admission number alone (financial records reference it)', () => {
      const out = anonymisedStudent({ dob: '2020-07-15' }) as any;
      expect(out.admissionNo).toBeUndefined();
    });
  });
});

describe('PII field encryption', () => {
  const KEY = process.env.PII_KEY;

  afterEach(() => {
    if (KEY === undefined) delete process.env.PII_KEY;
    else process.env.PII_KEY = KEY;
  });

  it('round-trips a value when a key is configured', () => {
    process.env.PII_KEY = 'a'.repeat(64);
    const enc = encryptField('ABCDE1234F');
    expect(enc).not.toBe('ABCDE1234F');
    expect(isEncrypted(enc!)).toBe(true);
    expect(decryptField(enc)).toBe('ABCDE1234F');
  });

  it('is idempotent: re-encrypting an already encrypted value is a no-op', () => {
    process.env.PII_KEY = 'b'.repeat(64);
    const once = encryptField('ABCDE1234F');
    expect(encryptField(once)).toBe(once);
  });

  it('reads legacy plaintext unchanged (no migration needed)', () => {
    process.env.PII_KEY = 'c'.repeat(64);
    expect(decryptField('123456789012')).toBe('123456789012');
  });

  it('fails closed on tampered ciphertext instead of throwing', () => {
    process.env.PII_KEY = 'd'.repeat(64);
    const enc = encryptField('ABCDE1234F')!;
    const tampered = enc.slice(0, -4) + 'AAA=';
    expect(decryptField(tampered)).toBeNull();
  });

  it('returns null for ciphertext when no key is present', () => {
    process.env.PII_KEY = 'e'.repeat(64);
    const enc = encryptField('ABCDE1234F')!;
    delete process.env.PII_KEY;
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptField(enc)).toBeNull();
  });

  it('masks a PAN for display', () => {
    process.env.PII_KEY = 'f'.repeat(64);
    expect(maskPan(encryptField('ABCDE1234F'))).toBe('****234F');
    expect(maskPan(null)).toBeNull();
  });

  it('treats empty values as absent', () => {
    process.env.PII_KEY = 'g'.repeat(64);
    expect(encryptField('')).toBeNull();
    expect(encryptField(null)).toBeNull();
  });
});

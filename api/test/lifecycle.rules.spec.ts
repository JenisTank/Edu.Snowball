import {
  PROGRAMME_LADDER,
  TAB_SCHEMAS,
  canPromote,
  mergePayload,
  nextProgramme,
  promotionRecord,
  readinessReport,
  schemaFor,
  validateTabPayload,
} from '../src/modules/lifecycle/lifecycle.rules';

describe('lifecycle', () => {
  it('defines a schema for every one of the 18 tabs', () => {
    expect(Object.keys(TAB_SCHEMAS)).toHaveLength(18);
    for (const [tab, fields] of Object.entries(TAB_SCHEMAS)) {
      expect(fields.length).toBeGreaterThan(0);
      expect(schemaFor(tab)).toBe(fields);
      // every field has a stable key and a human label
      for (const f of fields) {
        expect(f.key).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(f.label.length).toBeGreaterThan(0);
      }
    }
  });

  describe('payload validation', () => {
    it('accepts a complete record', () => {
      expect(
        validateTabPayload('GROWTH', { heightCm: 98.5, weightKg: 15.2, measuredOn: '2026-10-01' }),
      ).toEqual([]);
    });

    it('requires the mandatory fields', () => {
      const errors = validateTabPayload('INFIRMARY', { complaint: 'Fever' });
      expect(errors).toEqual(['Treatment given is required', 'Attended by is required']);
    });

    it('range-checks numbers', () => {
      expect(validateTabPayload('GROWTH', { heightCm: 5, weightKg: 15 })).toContain(
        'Height must be at least 30',
      );
      expect(validateTabPayload('PARENT_FEEDBACK', { feedback: 'Lovely', rating: 9 })).toContain(
        'Rating must be at most 5',
      );
      expect(validateTabPayload('GROWTH', { heightCm: 'tall', weightKg: 15 })).toContain(
        'Height must be a number',
      );
    });

    it('validates dates, selects, booleans and links', () => {
      expect(
        validateTabPayload('VACCINATION', { vaccine: 'MMR', givenOn: '10/10/2026' }),
      ).toContain('Given on must be a date (YYYY-MM-DD)');
      expect(
        validateTabPayload('STUDENT_INFORMATION', {
          address: 'Satellite',
          emergencyContact: '9999999999',
          primaryLanguage: 'Klingon',
        }),
      ).toContain('Primary language must be one of: Gujarati, English, Hindi, Other');
      expect(
        validateTabPayload('DOCUMENTS', { documentName: 'Birth cert', verified: 'yes' }),
      ).toContain('Verified by office must be true or false');
      expect(
        validateTabPayload('DOCUMENTS', { documentName: 'Birth cert', fileUrl: 'ftp://x' }),
      ).toContain('File must be a link');
    });

    it('rejects an unknown tab and a non-object payload', () => {
      expect(validateTabPayload('NOPE', {})).toEqual(['Unknown lifecycle tab "NOPE"']);
      expect(validateTabPayload('GROWTH', 'oops')).toEqual([
        'Payload must be an object of field values',
      ]);
    });

    it('merges a patch into the existing payload before validating', () => {
      const merged = mergePayload({ heightCm: 10 }, { weightKg: 15 });
      expect(merged).toEqual({ heightCm: 10, weightKg: 15 });
      expect(validateTabPayload('GROWTH', merged)).toContain('Height must be at least 30');
      expect(mergePayload(null, { a: 1 })).toEqual({ a: 1 });
    });
  });

  describe('progression', () => {
    it('walks the ladder one rung at a time', () => {
      expect(PROGRAMME_LADDER).toEqual(['TODD_CARE', 'PLAYHOUSE', 'PREK', 'K1', 'K2']);
      expect(nextProgramme('PLAYHOUSE')).toBe('PREK');
      expect(nextProgramme('K2')).toBeNull();
      expect(canPromote('K2', 'K1')).toBe(false);
      expect(canPromote('K1', 'K2')).toBe(true);
      expect(canPromote('K2', 'PREK')).toBe(false);
    });

    it('writes a parent-visible promotion record', () => {
      const rec = promotionRecord('K2', 'GRADE_1', 'Graduated');
      expect(rec.tab).toBe('STUDENT_INFORMATION');
      expect(rec.status).toBe('PROMOTED');
      expect(rec.title).toContain('K2');
      expect(rec.payload).toMatchObject({ fromProgramme: 'K2', toProgramme: 'GRADE_1' });
    });
  });

  describe('readiness report', () => {
    const base = {
      programmeCode: 'K2',
      attendancePresent: 90,
      attendanceTotal: 100,
      feeBalance: 0,
      ptmAttended: 3,
      ptmTotal: 3,
      portfolioEntries: 5,
      homePlanEntries: 2,
      openChildSupport: 0,
    };

    it('is ready when every criterion is met', () => {
      const r = readinessReport(base);
      expect(r.ready).toBe(true);
      expect(r.score).toBe(100);
      expect(r.criteria.map((c) => c.key)).toEqual([
        'attendance',
        'fees',
        'ptm',
        'portfolio',
        'home_plan',
      ]);
    });

    it('explains each miss in plain language', () => {
      const r = readinessReport({
        ...base,
        attendancePresent: 50,
        feeBalance: 12000,
        portfolioEntries: 1,
      });
      expect(r.ready).toBe(false);
      expect(r.score).toBe(40);
      expect(r.criteria[0].detail).toBe('50% present this year');
      expect(r.criteria[1].detail).toContain('12,000');
      expect(r.criteria[3].detail).toBe('1 entry recorded');
    });

    it('does not block on a school with no PTM or attendance yet', () => {
      const r = readinessReport({ ...base, attendanceTotal: 0, ptmTotal: 0, ptmAttended: 0 });
      expect(r.criteria[0].met).toBe(false); // no attendance recorded cannot be "ready"
      expect(r.criteria[2].met).toBe(true); // but a missing PTM is not a failure
    });

    it('flags an open child-support case for review without changing the score', () => {
      const r = readinessReport({ ...base, openChildSupport: 1 });
      expect(r.score).toBe(100);
      expect(r.ready).toBe(false);
    });
  });
});

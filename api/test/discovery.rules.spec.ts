import {
  buildDiscoverySummary,
  readSignals,
  RECOMMENDATIONS,
  RESULT_CODES,
  RESULT_LABEL,
} from '../src/modules/admissions/discovery.rules';

describe('Discovery Flight auto-summary', () => {
  it('maps each screening code to a defensible default recommendation', () => {
    const expected = {
      EP: 'READY',
      GP: 'READY',
      SP: 'READY_WITH_SUPPORT',
      NP: 'READY_WITH_SUPPORT',
      ND: 'ALTERNATE_LEVEL',
    } as const;
    for (const code of RESULT_CODES) {
      expect(buildDiscoverySummary({ resultCode: code }).suggestedRecommendation).toBe(
        expected[code],
      );
    }
  });

  it('never recommends plain admission when the session was inconclusive', () => {
    const s = buildDiscoverySummary({ resultCode: 'ND' });
    expect(s.suggestedRecommendation).toBe('ALTERNATE_LEVEL');
    expect(s.needsReview).toBe(true);
    expect(s.summary).toContain('could not be assessed');
  });

  it('falls back to ND for a missing or unknown code', () => {
    expect(buildDiscoverySummary({}).resultCode).toBe('ND');
    expect(buildDiscoverySummary({ resultCode: 'ZZ' }).resultCode).toBe('ND');
  });

  it('reads concrete signals out of the observer notes', () => {
    const signals = readSignals(
      'Settled quickly after separation; shared blocks, spoke in Gujarati, good crayon grip. Cried briefly at drop-off.',
    );
    expect(signals).toMatchObject({
      separation: true,
      sharing: true,
      language: true,
      motor: true,
      distress: true,
    });
    expect(signals.allergy).toBe(false);
  });

  it('turns signals into strengths and support-oriented watchouts', () => {
    const s = buildDiscoverySummary({
      resultCode: 'GP',
      childName: 'Aarav',
      programmeName: 'K1',
      notes: 'Settled quickly, shared materials, spoke clearly. Toilet accidents in the morning.',
    });
    expect(s.strengths.join(' | ')).toMatch(/Settled into the room/);
    expect(s.strengths.join(' | ')).toMatch(/Took turns/);
    expect(s.watchouts.join(' | ')).toMatch(/Toilet readiness/);
    expect(s.summary.startsWith('Aarav participated confidently')).toBe(true);
    expect(s.summary).toContain('for K1');
  });

  it('asks for a care plan when the notes mention a medical flag', () => {
    const s = buildDiscoverySummary({ resultCode: 'GP', notes: 'Peanut allergy noted by parent.' });
    expect(s.watchouts.join(' | ')).toMatch(/Medical note on file/);
    expect(s.needsReview).toBe(true);
  });

  it('flags an NP result with no supporting detail for review', () => {
    expect(buildDiscoverySummary({ resultCode: 'NP', notes: '' }).needsReview).toBe(true);
    expect(
      buildDiscoverySummary({ resultCode: 'NP', notes: 'Short attention span in circle time' })
        .needsReview,
    ).toBe(false);
  });

  it('always says something — empty notes never produce an empty summary', () => {
    for (const code of RESULT_CODES) {
      const s = buildDiscoverySummary({ resultCode: code });
      expect(s.summary.length).toBeGreaterThan(30);
      expect(s.strengths.length).toBeGreaterThan(0);
      expect(s.watchouts.length).toBeGreaterThan(0);
      expect(s.headline).toContain(RESULT_LABEL[code as keyof typeof RESULT_LABEL]);
    }
  });

  it('is marked internal-only so no caller leaks the code to a family', () => {
    expect(buildDiscoverySummary({ resultCode: 'EP' }).internalOnly).toBe(true);
    expect(RECOMMENDATIONS).toEqual(['READY', 'READY_WITH_SUPPORT', 'ALTERNATE_LEVEL']);
  });

  it('is deterministic — the same input always yields the same wording', () => {
    const input = { resultCode: 'SP', notes: 'Needed encouragement', childName: 'Myra' };
    expect(buildDiscoverySummary(input)).toEqual(buildDiscoverySummary(input));
  });
});

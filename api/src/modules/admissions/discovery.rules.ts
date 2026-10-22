/**
 * Discovery Flight summary rules — pure functions, no database access.
 *
 * The spec asks for an auto-generated summary and recommendation. It must be
 * **internal only** (the screening code is never shown to a family), and it has
 * to be predictable: the same codes always give the same wording, so a Centre
 * Head can defend the recommendation to a parent without re-reading notes.
 *
 * The text is generated from the screening code plus a light scan of the
 * observer's notes for keywords. Nothing here decides an admission — the Centre
 * Head still approves, and the suggestion is only a default.
 */

export const RESULT_CODES = ['EP', 'GP', 'SP', 'NP', 'ND'] as const;
export type ResultCode = (typeof RESULT_CODES)[number];

export const RECOMMENDATIONS = ['READY', 'READY_WITH_SUPPORT', 'ALTERNATE_LEVEL'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Child-facing meaning of each code — internal vocabulary, never parent-visible. */
export const RESULT_LABEL: Record<ResultCode, string> = {
  EP: 'Exceptional potential',
  GP: 'Good potential',
  SP: 'Some potential',
  NP: 'Needs preparation',
  ND: 'Not determined',
};

/** The default recommendation for each code, before notes are considered. */
const BASE_RECOMMENDATION: Record<ResultCode, Recommendation> = {
  EP: 'READY',
  GP: 'READY',
  SP: 'READY_WITH_SUPPORT',
  NP: 'READY_WITH_SUPPORT',
  ND: 'ALTERNATE_LEVEL',
};

export interface DiscoveryInput {
  resultCode?: string | null;
  notes?: string | null;
  childName?: string | null;
  programmeName?: string | null;
}

export interface DiscoverySummary {
  resultCode: ResultCode;
  resultLabel: string;
  /** One-line headline for the card. */
  headline: string;
  /** The generated paragraph the Centre Head reviews before approving. */
  summary: string;
  /** Concrete strengths seen during the session. */
  strengths: string[];
  /** What to watch, phrased as support — not as a deficit. */
  watchouts: string[];
  /** Default for the approve screen; the CH can still choose. */
  suggestedRecommendation: Recommendation;
  /** True when the notes mentioned something that needs a second look. */
  needsReview: boolean;
  /** Reminder so a caller never leaks the code to a family. */
  internalOnly: true;
}

const has = (text: string, words: string[]): boolean =>
  words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

interface Signals {
  separation: boolean;
  sharing: boolean;
  language: boolean;
  attention: boolean;
  motor: boolean;
  settles: boolean;
  distress: boolean;
  toileting: boolean;
  allergy: boolean;
}

/** Read the observer's notes for concrete signals. Absent notes = no signals. */
export function readSignals(notes?: string | null): Signals {
  const t = (notes ?? '').toLowerCase();
  return {
    separation: has(t, [
      'separation',
      'left mother',
      'left father',
      'settled quickly',
      'settled well',
    ]),
    sharing: has(t, ['shar', 'turn-taking', 'turn taking', 'waited for']),
    language: has(t, ['spoke', 'verbal', 'talked', 'words', 'gujarati', 'english', 'sing']),
    attention: has(t, ['focus', 'attention', 'sat through', 'concentrat', 'circle time']),
    motor: has(t, ['grip', 'crayon', 'climb', 'ran', 'jump', 'bead', 'motor']),
    settles: has(t, ['settl', 'calm', 'confident', 'happy', 'smiled', 'curious']),
    distress: has(t, ['cried', 'crying', 'distress', 'upset', 'cling', 'tantrum', 'shy']),
    toileting: has(t, ['toilet', 'diaper', 'nappy', 'pull-up', 'pull up']),
    allergy: has(t, ['allerg', 'epipen', 'rash', 'asthma', 'medical']),
  };
}

/**
 * Generate the summary for a recorded result.
 *
 * `ND` (not determined) never produces a "ready" recommendation: an inconclusive
 * session needs a re-assessment or an alternate level, not a guess.
 */
export function buildDiscoverySummary(input: DiscoveryInput): DiscoverySummary {
  const code = (RESULT_CODES as readonly string[]).includes(input.resultCode ?? '')
    ? (input.resultCode as ResultCode)
    : 'ND';
  const signals = readSignals(input.notes);
  const child = input.childName?.trim() || 'The child';
  const programme = input.programmeName?.trim();

  const strengths: string[] = [];
  const watchouts: string[] = [];

  if (signals.settles) strengths.push('Settled into the room and engaged with the activity');
  if (signals.separation) strengths.push('Handled separation from the parent well');
  if (signals.sharing) strengths.push('Took turns and shared materials');
  if (signals.language) strengths.push('Communicated readily with the facilitator');
  if (signals.attention) strengths.push('Held attention through a full activity');
  if (signals.motor) strengths.push('Used materials with confident fine-motor control');

  if (signals.distress)
    watchouts.push('Settling may need a shorter first week and a familiar drop-off');
  if (signals.toileting) watchouts.push('Toilet readiness: plan a change routine with the family');
  if (signals.allergy)
    watchouts.push('Medical note on file — confirm the care plan before day one');
  if (signals.attention && code === 'NP')
    watchouts.push('Short attention span — plan small-group circles first');
  if (watchouts.length === 0) watchouts.push('No specific concern recorded during the session');

  if (strengths.length === 0) {
    strengths.push(
      code === 'EP' || code === 'GP'
        ? 'Engaged with the session and completed the offered activities'
        : 'Attended the full session',
    );
  }

  const suggestedRecommendation = BASE_RECOMMENDATION[code];
  const needsReview =
    signals.allergy || code === 'ND' || (code === 'NP' && !signals.distress && !signals.attention);

  const tone: Record<ResultCode, string> = {
    EP: 'settled quickly and showed strong engagement across the session',
    GP: 'participated confidently and followed the session well',
    SP: 'joined in with encouragement and will benefit from a supported start',
    NP: 'needs a little preparation before a full-day routine',
    ND: 'could not be assessed reliably in this session',
  };

  const where = programme ? ` for ${programme}` : '';
  const verdict: Record<Recommendation, string> = {
    READY: `Recommend admission${where} as ready to start.`,
    READY_WITH_SUPPORT: `Recommend admission${where} with a supported start and a two-week check-in.`,
    ALTERNATE_LEVEL: `Recommend an alternate level or a re-assessment before admitting${where}.`,
  };

  const summary =
    `${child} ${tone[code]}. ` +
    (signals.separation || signals.settles
      ? 'Separation and settling were observed directly. '
      : '') +
    verdict[suggestedRecommendation] +
    (needsReview ? ' Flagged for Centre Head review before approval.' : '');

  return {
    resultCode: code,
    resultLabel: RESULT_LABEL[code],
    headline: `${RESULT_LABEL[code]} · ${verdict[suggestedRecommendation].replace(/\.$/, '')}`,
    summary: summary.trim(),
    strengths,
    watchouts,
    suggestedRecommendation,
    needsReview,
    internalOnly: true,
  };
}

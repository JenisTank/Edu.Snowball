/**
 * Lifecycle rules — pure functions.
 *
 * Each of the 18 tabs now has a real field schema, so a "record" is a typed
 * entry rather than free-form JSON. That matters for two reasons: the parent
 * portal can render a tab without guessing, and a readiness report can be
 * computed from actual fields instead of string matching.
 */

export type FieldType = 'text' | 'longtext' | 'number' | 'date' | 'select' | 'boolean' | 'url';

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export const TAB_SCHEMAS: Record<string, FieldSchema[]> = {
  STUDENT_INFORMATION: [
    {
      key: 'primaryLanguage',
      label: 'Primary language',
      type: 'select',
      options: ['Gujarati', 'English', 'Hindi', 'Other'],
    },
    { key: 'address', label: 'Home address', type: 'longtext', required: true },
    { key: 'emergencyContact', label: 'Emergency contact', type: 'text', required: true },
  ],
  FAMILY_HISTORY: [
    {
      key: 'familyStructure',
      label: 'Family structure',
      type: 'select',
      options: ['Nuclear', 'Joint', 'Single parent', 'Other'],
    },
    { key: 'notes', label: 'Notes', type: 'longtext' },
  ],
  SIBLINGS: [
    { key: 'siblingNames', label: 'Sibling names', type: 'text' },
    { key: 'siblingSchool', label: 'Sibling school', type: 'text' },
  ],
  PARENT_FEEDBACK: [
    { key: 'feedback', label: 'Feedback', type: 'longtext', required: true },
    { key: 'rating', label: 'Rating', type: 'number', min: 1, max: 5 },
    {
      key: 'channel',
      label: 'Received via',
      type: 'select',
      options: ['In person', 'Phone', 'WhatsApp', 'Form'],
    },
  ],
  INFIRMARY: [
    { key: 'complaint', label: 'Complaint', type: 'text', required: true },
    { key: 'treatment', label: 'Treatment given', type: 'longtext', required: true },
    { key: 'attendedBy', label: 'Attended by', type: 'text', required: true },
    { key: 'parentInformed', label: 'Parent informed', type: 'boolean' },
  ],
  VACCINATION: [
    { key: 'vaccine', label: 'Vaccine', type: 'text', required: true },
    { key: 'doseNumber', label: 'Dose number', type: 'number', min: 1, max: 10 },
    { key: 'givenOn', label: 'Given on', type: 'date', required: true },
  ],
  GROWTH: [
    {
      key: 'heightCm',
      label: 'Height',
      type: 'number',
      unit: 'cm',
      min: 30,
      max: 200,
      required: true,
    },
    {
      key: 'weightKg',
      label: 'Weight',
      type: 'number',
      unit: 'kg',
      min: 2,
      max: 100,
      required: true,
    },
    { key: 'measuredOn', label: 'Measured on', type: 'date' },
  ],
  HEALTH_MEDICAL: [
    { key: 'condition', label: 'Condition', type: 'text', required: true },
    { key: 'doctor', label: 'Doctor', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'longtext' },
  ],
  DOCUMENTS: [
    { key: 'documentName', label: 'Document', type: 'text', required: true },
    { key: 'fileUrl', label: 'File', type: 'url' },
    { key: 'verified', label: 'Verified by office', type: 'boolean' },
  ],
  FEES: [
    { key: 'plan', label: 'Plan', type: 'select', options: ['PLAN_A', 'PLAN_B', 'PLAN_C'] },
    { key: 'receiptNo', label: 'Receipt no.', type: 'text' },
  ],
  TC_INFORMATION: [
    { key: 'reason', label: 'Reason', type: 'longtext', required: true },
    { key: 'lastDay', label: 'Last day', type: 'date', required: true },
    { key: 'duesCleared', label: 'Dues cleared', type: 'boolean' },
  ],
  ATTENDANCE: [{ key: 'note', label: 'Note', type: 'longtext' }],
  PARENT_COMMUNICATION: [
    { key: 'summary', label: 'What was discussed', type: 'longtext', required: true },
    {
      key: 'channel',
      label: 'Channel',
      type: 'select',
      options: ['In person', 'Phone', 'WhatsApp', 'Email'],
    },
    { key: 'followUpOn', label: 'Follow up on', type: 'date' },
  ],
  LEAVE_APPLICATION: [
    { key: 'fromDate', label: 'From', type: 'date', required: true },
    { key: 'toDate', label: 'To', type: 'date', required: true },
    { key: 'reason', label: 'Reason', type: 'text', required: true },
    { key: 'approved', label: 'Approved', type: 'boolean' },
  ],
  CHILD_SUPPORT: [
    { key: 'observation', label: 'Observation', type: 'longtext', required: true },
    { key: 'plan', label: 'Support plan', type: 'longtext' },
  ],
  IEP: [
    { key: 'goals', label: 'Goals', type: 'longtext', required: true },
    { key: 'reviewDate', label: 'Review date', type: 'date' },
  ],
  HOME_PLAN: [
    { key: 'activity', label: 'Activity', type: 'text', required: true },
    { key: 'durationMinutes', label: 'Duration', type: 'number', unit: 'min', min: 1, max: 240 },
  ],
  WORKSHEETS_PORTFOLIO: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'subject', label: 'Learning area', type: 'text' },
    { key: 'evidenceUrl', label: 'Evidence', type: 'url' },
  ],
};

/** Tabs the parent portal may render. */
export const PARENT_VISIBLE = 'STAFF_PARENT';

export function schemaFor(tab: string): FieldSchema[] | null {
  return TAB_SCHEMAS[tab] ?? null;
}

/** Validate a payload against its tab schema. Returns human-readable errors. */
export function validateTabPayload(tab: string, payload: unknown): string[] {
  const schema = schemaFor(tab);
  if (!schema) return [`Unknown lifecycle tab "${tab}"`];
  if (payload == null) payload = {};
  if (typeof payload !== 'object' || Array.isArray(payload))
    return ['Payload must be an object of field values'];

  const p = payload as Record<string, unknown>;
  const errors: string[] = [];
  for (const f of schema) {
    const v = p[f.key];
    const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (f.required && empty) {
      errors.push(`${f.label} is required`);
      continue;
    }
    if (empty) continue;
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) errors.push(`${f.label} must be a number`);
      else if (f.min != null && n < f.min) errors.push(`${f.label} must be at least ${f.min}`);
      else if (f.max != null && n > f.max) errors.push(`${f.label} must be at most ${f.max}`);
    }
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}/.test(String(v)))
      errors.push(`${f.label} must be a date (YYYY-MM-DD)`);
    if (f.type === 'boolean' && typeof v !== 'boolean')
      errors.push(`${f.label} must be true or false`);
    if (f.type === 'select' && f.options && !f.options.includes(String(v)))
      errors.push(`${f.label} must be one of: ${f.options.join(', ')}`);
    if (f.type === 'url' && !/^(https?:\/\/|\/)/.test(String(v)))
      errors.push(`${f.label} must be a link`);
    if (f.type === 'text' && String(v).length > 500)
      errors.push(`${f.label} is too long (max 500)`);
    if (f.type === 'longtext' && String(v).length > 4000)
      errors.push(`${f.label} is too long (max 4000)`);
  }
  return errors;
}

/** Merge an update into an existing payload before validating. */
export function mergePayload(existing: unknown, patch: unknown) {
  const base = typeof existing === 'object' && existing ? { ...(existing as object) } : {};
  const next = typeof patch === 'object' && patch ? { ...(patch as object) } : {};
  return { ...base, ...next };
}

// ─────────────────────────── progression ───────────────────────────

/** The academic ladder; a child only moves one step at a time. */
export const PROGRAMME_LADDER = ['TODD_CARE', 'PLAYHOUSE', 'PREK', 'K1', 'K2'];

export function nextProgramme(code: string): string | null {
  const i = PROGRAMME_LADDER.indexOf(code);
  if (i < 0 || i === PROGRAMME_LADDER.length - 1) return null;
  return PROGRAMME_LADDER[i + 1];
}

/** Promotion is only legal to the next rung (or out of the school). */
export function canPromote(fromCode: string, toCode: string): boolean {
  return nextProgramme(fromCode) === toCode;
}

export interface ReadinessInput {
  programmeCode: string;
  attendancePresent: number;
  attendanceTotal: number;
  feeBalance: number;
  ptmAttended: number;
  ptmTotal: number;
  portfolioEntries: number;
  homePlanEntries: number;
  openChildSupport: number;
}

export interface ReadinessCriterion {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

/**
 * K2 → Grade 1 readiness report (spec: "Readiness Report").
 *
 * Five criteria, each with a reason a parent can read. The score is the share
 * of criteria met — deliberately never a mark or a rank.
 */
export function readinessReport(input: ReadinessInput): {
  score: number;
  ready: boolean;
  criteria: ReadinessCriterion[];
} {
  const attendancePct = input.attendanceTotal
    ? Math.round((input.attendancePresent / input.attendanceTotal) * 100)
    : 0;
  const ptmPct = input.ptmTotal ? Math.round((input.ptmAttended / input.ptmTotal) * 100) : 0;

  const criteria: ReadinessCriterion[] = [
    {
      key: 'attendance',
      label: 'Regular attendance',
      met: input.attendanceTotal > 0 && attendancePct >= 75,
      detail: input.attendanceTotal
        ? `${attendancePct}% present this year`
        : 'No attendance recorded yet',
    },
    {
      key: 'fees',
      label: 'Fees up to date',
      met: input.feeBalance <= 0,
      detail:
        input.feeBalance <= 0
          ? 'No balance outstanding'
          : `₹${input.feeBalance.toLocaleString('en-IN')} pending`,
    },
    {
      key: 'ptm',
      label: 'Parent–teacher meetings attended',
      met: input.ptmTotal === 0 ? true : ptmPct >= 75,
      detail: input.ptmTotal
        ? `${input.ptmAttended} of ${input.ptmTotal} attended`
        : 'No PTM held yet',
    },
    {
      key: 'portfolio',
      label: 'Portfolio evidence',
      met: input.portfolioEntries >= 3,
      detail: `${input.portfolioEntries} entr${input.portfolioEntries === 1 ? 'y' : 'ies'} recorded`,
    },
    {
      key: 'home_plan',
      label: 'Home learning plan',
      met: input.homePlanEntries >= 1,
      detail: input.homePlanEntries
        ? `${input.homePlanEntries} plan(s) shared`
        : 'No home plan shared yet',
    },
  ];

  // An open child-support case does not block promotion; it flags a review.
  const review = input.openChildSupport > 0;
  const met = criteria.filter((c) => c.met).length;
  const score = Math.round((met / criteria.length) * 100);
  return { score, ready: met === criteria.length && !review, criteria };
}

/** The lifecycle record written when a child is promoted. */
export function promotionRecord(fromCode: string, toCode: string, note?: string) {
  return {
    tab: 'STUDENT_INFORMATION',
    title: `Promoted ${fromCode} → ${toCode}`,
    status: 'PROMOTED',
    payload: { fromProgramme: fromCode, toProgramme: toCode, note: note ?? null },
  };
}

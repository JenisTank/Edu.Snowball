/**
 * DPDP Act 2023 rules — pure functions.
 *
 * The Act needs four things from an ERP: a consent record that can be produced
 * on demand, a published retention period, the ability to hand a family their
 * data, and the ability to erase it (except where another law says keep it).
 * All four are encoded here so the behaviour is testable.
 */

export const CONSENT_TYPES = [
  'DATA_PROCESSING', // core service: attendance, fees, communication
  'PHOTO_VIDEO', // classroom photos, social media (optional)
  'MEDICAL', // allergies, medical notes, infirmary
  'TRANSport', // transport pick-up/drop
  'WHATSAPP', // WhatsApp channel opt-in
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** Consents a child cannot be enrolled without. */
export const MANDATORY_CONSENTS: ConsentType[] = ['DATA_PROCESSING'];

/** Consents that are offered but never required. */
export const OPTIONAL_CONSENTS: ConsentType[] = ['PHOTO_VIDEO', 'MEDICAL', 'TRANSport', 'WHATSAPP'];

export interface ConsentLike {
  consentType: string;
  granted: boolean;
  grantedBy?: string | null;
  grantedAt: Date | string;
}

/**
 * Latest decision per consent type. Consent is append-only: a later "no"
 * supersedes an earlier "yes", and the history stays for the auditor.
 */
export function latestConsents(
  rows: ConsentLike[],
): Record<string, { granted: boolean; grantedAt: string; grantedBy: string | null }> {
  const out: Record<string, { granted: boolean; grantedAt: string; grantedBy: string | null }> = {};
  for (const r of [...rows].sort(
    (a, b) => new Date(a.grantedAt).getTime() - new Date(b.grantedAt).getTime(),
  )) {
    out[r.consentType] = {
      granted: !!r.granted,
      grantedAt: new Date(r.grantedAt).toISOString(),
      grantedBy: r.grantedBy ?? null,
    };
  }
  return out;
}

/** The consent register a DPDP audit asks for. */
export function consentRegister(rows: ConsentLike[]) {
  const latest = latestConsents(rows);
  const missing = [...MANDATORY_CONSENTS, ...OPTIONAL_CONSENTS].filter((t) => !(t in latest));
  const declined = [...MANDATORY_CONSENTS, ...OPTIONAL_CONSENTS].filter(
    (t) => latest[t] && !latest[t].granted,
  );
  return {
    latest,
    missing,
    declined,
    mandatorySatisfied: MANDATORY_CONSENTS.every((t) => latest[t]?.granted),
    history: [...rows].sort(
      (a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime(),
    ),
  };
}

// ───────────────────────────── retention ─────────────────────────────

export interface RetentionPolicy {
  /** Days of message/notification history. */
  messageDays: number;
  /** Days of read parent conversations. */
  conversationDays: number;
  /** Days of broadcast push subscriptions after last update. */
  pushDays: number;
  /** Days of audit log (statutory minimum is usually several years). */
  auditDays: number;
  /** Days after a child leaves that the record may be kept (7 years = fees). */
  studentDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  messageDays: 730, // 2 years
  conversationDays: 730,
  pushDays: 180,
  auditDays: 2555, // 7 years
  studentDays: 2555, // 7 years — financial records must survive
};

/** The timestamp before which a table's rows may be purged. */
export function cutoff(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/** What the retention job will touch, with the computed cutoffs. */
export function retentionPlan(policy: Partial<RetentionPolicy> = {}, now: Date = new Date()) {
  const p: RetentionPolicy = { ...DEFAULT_RETENTION, ...policy };
  return {
    policy: p,
    messageBefore: cutoff(p.messageDays, now),
    conversationBefore: cutoff(p.conversationDays, now),
    pushBefore: cutoff(p.pushDays, now),
    auditBefore: cutoff(p.auditDays, now),
    studentBefore: cutoff(p.studentDays, now),
  };
}

// ───────────────────────────── erasure ─────────────────────────────

/**
 * Data that must survive an erasure request: fee receipts, certificates and
 * the audit trail are required by tax and education regulations. Everything
 * else that identifies the child is removed.
 */
export const RETAINED_ON_ERASURE = [
  'fee_transactions',
  'certificates',
  'audit_log',
  'payroll',
] as const;

export interface ErasureResult {
  studentId: string;
  anonymisedAt: string;
  fieldsCleared: string[];
  retained: readonly string[];
}

/** Fields that are cleared on erasure (never the admission number). */
export const ERASURE_FIELDS = [
  'firstName',
  'lastName',
  'photoUrl',
  'bloodGroup',
  'allergies',
  'medicalNotes',
  'fatherName',
  'fatherPhone',
  'motherName',
  'motherPhone',
  'guardianEmail',
  'addressArea',
  'dob',
] as const;

/** The anonymised payload written over a student record. */
export function anonymisedStudent(student: { dob?: Date | string | null }, now: Date = new Date()) {
  const tag = now.getTime().toString(36).toUpperCase().slice(-6);
  // Keep only the birth year: age-band reports still work, the exact date does not.
  const birthYear = student.dob ? new Date(student.dob).getUTCFullYear() : 2019;
  return {
    firstName: 'Erased',
    lastName: `Child ${tag}`,
    photoUrl: null,
    bloodGroup: null,
    allergies: null,
    medicalNotes: null,
    fatherName: null,
    fatherPhone: null,
    motherName: null,
    motherPhone: null,
    guardianEmail: null,
    addressArea: null,
    dob: new Date(Date.UTC(birthYear, 0, 1)),
    anonymisedAt: now,
  };
}

/** Is this record already erased? */
export function isAnonymised(student: { anonymisedAt?: Date | string | null }): boolean {
  return !!student.anonymisedAt;
}

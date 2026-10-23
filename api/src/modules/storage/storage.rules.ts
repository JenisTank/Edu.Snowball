/**
 * Document storage rules.
 *
 * The client asked for "storage per student, deleted manually by admin when
 * needed". That makes two things non-negotiable:
 *  1. nothing here ever expires on its own — the retention job must skip these
 *     rows, because a birth certificate deleted by a timer is a data loss;
 *  2. deletion is a role, not a button — FOUNDER / ACADEMIC_DIR / CENTRE_HEAD.
 * The rules below are pure so those two promises are tested.
 */

/** What a child's file can be. Kept short on purpose — free text becomes chaos. */
export const DOCUMENT_KINDS = [
  'BIRTH_CERT',
  'AADHAAR',
  'PHOTO',
  'MEDICAL',
  'REPORT_CARD',
  'PTM_FORM',
  'TRANSFER',
  'OTHER',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Roles allowed to delete a student's document. Nobody else, ever. */
export const DOCUMENT_DELETE_ROLES = ['FOUNDER', 'ACADEMIC_DIR', 'CENTRE_HEAD'] as const;

export function canDeleteDocuments(role: string): boolean {
  return (DOCUMENT_DELETE_ROLES as readonly string[]).includes(role);
}

export interface UploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Validate before a byte is written, so a rejected upload leaves no orphan. */
export function validateUpload(input: UploadInput): { ok: true } | { ok: false; error: string } {
  if (!input.fileName?.trim()) return { ok: false, error: 'A file name is required' };
  if (!ALLOWED_MIME[input.mimeType])
    return { ok: false, error: `Unsupported file type: ${input.mimeType || 'unknown'}` };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0)
    return { ok: false, error: 'The file is empty' };
  if (input.sizeBytes > MAX_DOCUMENT_BYTES)
    return { ok: false, error: 'Files larger than 10 MB are not accepted' };
  return { ok: true };
}

/** Safe file name for storage: no paths, no spaces, no surprises. */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return cleaned || 'file';
}

/** Deterministic-ish key: unit/student/kind/timestamp-name. */
export function storageKey(
  unitId: string,
  studentId: string,
  kind: string,
  fileName: string,
  now: Date = new Date(),
): string {
  const stamp = now
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  return `${unitId}/${studentId}/${kind}/${stamp}-${safeFileName(fileName)}`;
}

/** Human size for the list. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

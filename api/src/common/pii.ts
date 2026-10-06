// ─────────────────────────────────────────────────────────────
// DPDP — PII encryption at rest (AES-256-GCM)
//
// Sensitive child fields (blood group, allergies, medical notes) are stored
// encrypted. Format:  enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
//
// Key: PII_ENCRYPTION_KEY — 32 bytes, base64 or 64-char hex.
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// With no key configured the helpers are a transparent pass-through, so a
// dev/demo database keeps working. decrypt() also passes through plaintext,
// which makes the rollout safe on existing rows (encrypt-on-next-write) and
// lets `POST /dpdp/encrypt-backfill` migrate history in one shot.
// ─────────────────────────────────────────────────────────────
import * as crypto from 'crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer | null {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    console.warn('⚠️ PII_ENCRYPTION_KEY must decode to 32 bytes — PII encryption is DISABLED');
    return null;
  }
  return buf;
}

export const piiEnabled = () => key() !== null;
export const isEncrypted = (v?: string | null) => !!v && v.startsWith(PREFIX);

export function encryptPII<T extends string | null | undefined>(value: T): T {
  const k = key();
  if (!k || !value || isEncrypted(value)) return value;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}` as T;
}

export function decryptPII<T extends string | null | undefined>(value: T): T {
  if (!value || !isEncrypted(value)) return value; // plaintext / legacy row
  const k = key();
  if (!k) return '•••••• (encrypted)' as T; // key missing — never leak ciphertext
  try {
    const [ivB64, tagB64, ctB64] = String(value).slice(PREFIX.length).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
    d.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ctB64, 'base64')), d.final()]).toString('utf8') as T;
  } catch {
    return '•••••• (undecryptable)' as T;
  }
}

// Child fields classified as sensitive personal data under the DPDP Act.
export const STUDENT_PII_FIELDS = ['bloodGroup', 'allergies', 'medicalNotes'] as const;

export function encryptStudentPII<T extends Record<string, any>>(data: T): T {
  const out: any = { ...data };
  for (const f of STUDENT_PII_FIELDS) if (f in out) out[f] = encryptPII(out[f]);
  return out;
}

export function decryptStudentPII<T extends Record<string, any> | null>(row: T): T {
  if (!row) return row;
  const out: any = { ...row };
  for (const f of STUDENT_PII_FIELDS) if (f in out) out[f] = decryptPII(out[f]);
  return out;
}

export function decryptStudents<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(r => decryptStudentPII(r));
}

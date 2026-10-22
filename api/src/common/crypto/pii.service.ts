import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { env } from '../../config/env';

/**
 * Field-level encryption for statutory identifiers (DPDP Act, 2023).
 *
 * PAN, UAN, ESIC number and the salary bank account are personal data that a
 * breach would make reportable. They are encrypted with AES-256-GCM before they
 * reach Postgres, so a database dump alone is not enough to read them.
 *
 * The ciphertext is self-describing (`enc:v1:<iv>:<tag>:<data>`), which means:
 *  - rows written before encryption are read back unchanged (no migration),
 *  - a key rotation can be introduced later by adding `enc:v2`.
 */

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function key(): Buffer | null {
  const raw = env.piiKey;
  if (!raw) return null;
  // Accept hex, base64 or a plain passphrase; always derive a 32-byte key.
  const asHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  const asB64 = raw.length >= 43 ? Buffer.from(raw, 'base64') : null;
  const source = asHex ?? (asB64 && asB64.length === 32 ? asB64 : Buffer.from(raw, 'utf8'));
  return createHash('sha256').update(source).digest();
}

export function encryptionEnabled(): boolean {
  return !!env.piiKey;
}

export function isEncrypted(value?: string | null): boolean {
  return !!value && value.startsWith(PREFIX);
}

/** Encrypt a value. Idempotent: already-encrypted values pass through. */
export function encryptField(value?: string | null): string | null {
  if (value == null || value === '') return null;
  if (isEncrypted(value)) return value;
  const k = key();
  if (!k) return value; // development without PII_KEY
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, k, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

/** Decrypt a value; anything unencrypted (legacy data) is returned unchanged. */
export function decryptField(value?: string | null): string | null {
  if (!value) return null;
  if (!isEncrypted(value)) return value;
  const k = key();
  if (!k) return null; // ciphertext with no key: fail closed, never throw
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  try {
    const decipher = createDecipheriv(ALGO, k, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // tampered or wrong key: treat as absent rather than crash
  }
}

// ───────────────────────────── masking ─────────────────────────────

/** Never show a full PAN in a UI or an audit row. */
export function maskPan(pan?: string | null): string | null {
  if (!pan) return null;
  const v = decryptField(pan) ?? '';
  return v.length >= 4 ? `****${v.slice(-4).toUpperCase()}` : '****';
}

export function maskAccount(account?: string | null): string | null {
  if (!account) return null;
  const v = decryptField(account) ?? '';
  return v.length >= 4 ? `****${v.slice(-4)}` : '****';
}

export function maskId(value?: string | null): string | null {
  if (!value) return null;
  const v = decryptField(value) ?? '';
  return v.length >= 4 ? `****${v.slice(-4)}` : '****';
}

/** Fields on Employee that must never be stored in clear text. */
export const SENSITIVE_EMPLOYEE_FIELDS = ['pan', 'uan', 'esicNumber', 'bankAccountNo'] as const;

export function encryptEmployeeFields<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = { ...data };
  for (const f of SENSITIVE_EMPLOYEE_FIELDS) {
    if (f in out && typeof out[f] === 'string') out[f] = encryptField(out[f]);
  }
  return out as T;
}

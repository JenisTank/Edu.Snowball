import * as bcrypt from 'bcryptjs';

/**
 * bcrypt cost 12 — roughly 4× slower than the old cost 10, which makes
 * offline cracking meaningfully harder while staying ~250 ms per login.
 * Override with BCRYPT_ROUNDS (tests use 4 to stay fast).
 */
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

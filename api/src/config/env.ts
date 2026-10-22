/**
 * Environment contract for the API — the single place that documents and
 * validates every variable the process reads.
 */
const PLACEHOLDER_SECRETS = new Set(['change_me', 'secret', 'changeme', 'dev', 'password', '']);

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? 'development';
  },
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? '';
  },
  get redisUrl() {
    return process.env.REDIS_URL ?? 'redis://localhost:6379';
  },
  get jwtSecret() {
    return process.env.JWT_SECRET ?? '';
  },
  /** Spec: 15-minute access token; refresh tokens live 7 days. */
  get jwtExpiresIn() {
    return process.env.JWT_EXPIRES ?? '15m';
  },
  get waBspKey() {
    return process.env.WA_BSP_KEY ?? '';
  },
  get vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  },
  get vapidPrivateKey() {
    return process.env.VAPID_PRIVATE_KEY ?? '';
  },
  get vapidSubject() {
    return process.env.VAPID_SUBJECT ?? 'mailto:admin@bumblebkidz.com';
  },
};

/** Fail fast, with an actionable message, instead of crashing on first request. */
export function validateEnv(): void {
  const problems: string[] = [];
  if (!env.databaseUrl) problems.push('DATABASE_URL is required (PostgreSQL connection string)');
  if (!env.jwtSecret) problems.push('JWT_SECRET is required');
  else if (
    env.isProduction &&
    (PLACEHOLDER_SECRETS.has(env.jwtSecret) || env.jwtSecret.length < 32)
  ) {
    problems.push('JWT_SECRET must be unique and at least 32 characters in production');
  }

  if (problems.length) {
    throw new Error(
      'Invalid environment:\n  - ' +
        problems.join('\n  - ') +
        '\nSee .env.example for the full list.',
    );
  }

  if (!env.waBspKey)
    console.warn('⚠️  WA_BSP_KEY not set — WhatsApp dispatch stays in sandbox mode');
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    console.warn('⚠️  VAPID keys not set — parent web push stays disabled');
  }
}

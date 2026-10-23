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
  // ── UPI (online fee collection, no gateway) ──────────────────────────────
  /**
   * Head Office fallback UPI id for units that have not published their own.
   * Empty leaves those units without online collection — which is a truthful
   * state, not a failure.
   */
  get upiVpa() {
    return process.env.UPI_VPA ?? '';
  },
  get upiPayeeName() {
    return process.env.UPI_PAYEE_NAME ?? 'BumbleB Kidz';
  },
  // ── Observability ─────────────────────────────────────────────────────────
  /** Sentry DSN for API error tracking; empty keeps reporting off. */
  get sentryDsn() {
    return process.env.SENTRY_DSN ?? '';
  },
  /** Release tag shown next to every crash (git sha or image tag). */
  get release() {
    return process.env.APP_RELEASE ?? `bumbleb-api@${process.env.npm_package_version ?? 'dev'}`;
  },
  /** 0 disables tracing; 0.1 samples a tenth of transactions. */
  get sentryTracesSampleRate() {
    return Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1);
  },
  // ── WhatsApp: Evolution API (default) or Meta Cloud API ─────────────────
  /** Base URL of a self-hosted Evolution API, e.g. http://evolution:8080. */
  get evolutionApiUrl() {
    return process.env.EVOLUTION_API_URL ?? '';
  },
  /** The instance's own API key (Evolution → Manager → Instance → apikey). */
  get evolutionApiKey() {
    return process.env.EVOLUTION_API_KEY ?? '';
  },
  /** Instance name created in Evolution, e.g. `bumbleb-u1`. */
  get evolutionInstance() {
    return process.env.EVOLUTION_INSTANCE ?? '';
  },
  get waBspKey() {
    return process.env.WA_BSP_KEY ?? '';
  },
  get waBspUrl() {
    return process.env.WA_BSP_URL ?? 'https://graph.facebook.com/v20.0';
  },
  /** WhatsApp Business phone-number id (Cloud API) or the BSP's sender id. */
  get waPhoneId() {
    return process.env.WA_PHONE_ID ?? '';
  },
  /** SMTP connection string, e.g. smtps://user:pass@smtp.host:465 */
  get smtpUrl() {
    return process.env.SMTP_URL ?? '';
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? 'BumbleB Kidz <no-reply@bumblebkidz.com>';
  },
  /** 32-byte key (base64/hex) used to encrypt statutory PII at rest. */
  get piiKey() {
    return process.env.PII_KEY ?? '';
  },
  /** How many days of message history to keep (DPDP retention). */
  get retentionMessageDays() {
    return Number(process.env.RETENTION_MESSAGE_DAYS ?? 730);
  },
  /** How many years of audit log to keep (companies act / DPDP). */
  get retentionAuditDays() {
    return Number(process.env.RETENTION_AUDIT_DAYS ?? 2555);
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
  if (!env.smtpUrl) console.warn('⚠️  SMTP_URL not set — email fallback stays disabled');
  if (!env.piiKey)
    console.warn(
      '⚠️  PII_KEY not set — statutory identifiers are stored unencrypted (development only)',
    );
  else if (env.isProduction && env.piiKey.length < 32)
    problems.push('PII_KEY must be at least 32 characters when set in production');
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    console.warn('⚠️  VAPID keys not set — parent web push stays disabled');
  }
}

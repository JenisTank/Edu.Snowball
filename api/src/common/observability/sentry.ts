import * as Sentry from '@sentry/node';

import { env } from '../../config/env';

/**
 * Error reporting behind a switch.
 *
 * A missing DSN is the normal state for local dev and for the sandbox, so every
 * helper is a no-op unless `initSentry()` actually started the SDK. Nothing in
 * the request path may throw because monitoring is not configured.
 */
let enabled = false;

export function initSentry(): boolean {
  if (!env.sentryDsn) return false;
  try {
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.nodeEnv,
      release: env.release,
      tracesSampleRate: Number.isFinite(env.sentryTracesSampleRate)
        ? env.sentryTracesSampleRate
        : 0,
      // Financial and child data must never leave the server in an event payload.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.data) delete event.request.data;
        if (event.request?.cookies) delete event.request.cookies;
        return event;
      },
    });
    enabled = true;
    return true;
  } catch {
    enabled = false;
    return false;
  }
}

export const sentryEnabled = () => enabled;

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* never let monitoring break a request */
  }
}

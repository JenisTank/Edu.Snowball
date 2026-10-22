import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { captureException } from '../observability/sentry';

/**
 * Keeps one predictable error body for the frontend (`{ statusCode, message }`)
 * while logging unexpected failures with a stack trace.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
      // 5xx means we broke something — send it to Sentry (no-op without a DSN).
      captureException(exception, { statusCode: status });
    }

    if (typeof payload === 'string') {
      return res.status(status).json({ statusCode: status, message: payload });
    }
    if (payload && typeof payload === 'object') return res.status(status).json(payload);
    return res.status(status).json({ statusCode: status, message: 'Internal server error' });
  }
}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { JwtPayload } from '../types/common.types';

const isProd = process.env.NODE_ENV === 'production';

// Paths that carry PII/PHI — exclude query params from logs in production
const SENSITIVE_PATHS = [
  '/auth/',
  '/patients/',
  '/consultations/',
  '/prescriptions/',
];

function sanitizeUrl(url: string): string {
  if (!isProd) return url;
  return SENSITIVE_PATHS.some((p) => url.includes(p)) ? url.split('?')[0] : url;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<
      Request & { user?: JwtPayload; requestId?: string }
    >();
    const response = ctx.getResponse<Response>();

    const { method } = request;
    const url = sanitizeUrl(request.url);
    const tenantId = request.user?.tenantId ?? 'anon';
    const userId = request.user?.sub ?? 'anon';
    const role = request.user?.role ?? 'anon';
    const requestId =
      request.requestId ?? (request.headers['x-request-id'] as string) ?? '-';
    const startTime = Date.now();

    if (isProd) {
      this.logger.log(
        JSON.stringify({
          event: 'req',
          requestId,
          method,
          url,
          tenantId,
          userId,
          role,
        }),
      );
    } else {
      this.logger.log(
        `→ [${requestId}] ${method} ${url} tenant=${tenantId} user=${userId}`,
      );
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - startTime;
          const status = response.statusCode;
          if (isProd) {
            this.logger.log(
              JSON.stringify({
                event: 'res',
                requestId,
                method,
                url,
                status,
                ms,
                tenantId,
                userId,
              }),
            );
          } else {
            this.logger.log(
              `← [${requestId}] ${method} ${url} ${status} ${ms}ms`,
            );
          }
        },
        error: (err: Error) => {
          const ms = Date.now() - startTime;
          if (isProd) {
            this.logger.error(
              JSON.stringify({
                event: 'err',
                requestId,
                method,
                url,
                error: err.message,
                ms,
                tenantId,
                userId,
              }),
            );
          } else {
            this.logger.error(
              `← [${requestId}] ${method} ${url} ERROR=${err.message} ${ms}ms`,
            );
          }
        },
      }),
    );
  }
}

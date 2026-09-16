import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// PostgreSQL / TypeORM QueryFailedError codes
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MAP: Readonly<
  Record<string, { status: number; message: string }>
> = {
  '23505': { status: 409, message: 'A record with this value already exists' }, // unique_violation
  '23503': { status: 400, message: 'Related record not found' }, // foreign_key_violation
  '23502': { status: 400, message: 'A required field is missing' }, // not_null_violation
  '23514': { status: 400, message: 'Value violates a check constraint' }, // check_violation
  '22001': { status: 400, message: 'Input value too long' }, // string_data_right_truncation
  '42P01': { status: 500, message: 'Database table not found' }, // undefined_table
};

function isTypeOrmQueryError(
  err: unknown,
): err is { code: string; detail?: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>).constructor?.name === 'QueryFailedError' &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}

function isThrottlerError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>).constructor?.name === 'ThrottlerException'
  );
}

const isProd = process.env.NODE_ENV === 'production';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const requestId =
      request.requestId ?? request.headers['x-request-id'] ?? 'unknown';
    const path = request.url;
    const method = request.method;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] = [];

    // HttpException (includes NestJS validation, auth, guards)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          errors = b.message as string[];
          message = 'Validation failed';
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
      }
      this.logger.warn(
        `[${requestId}] HTTP ${statusCode} ${method} ${path}: ${message}`,
      );

      // TypeORM / PostgreSQL database errors
    } else if (isTypeOrmQueryError(exception)) {
      const mapped = PG_ERROR_MAP[exception.code];
      statusCode = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
      message = mapped?.message ?? 'Database error';

      // Improve 23502 (not-null): extract which column is missing so the user knows what to fix
      if (exception.code === '23502') {
        const col = exception.message.match(/column "([^"]+)"/)?.[1];
        if (col && col !== 'id') {
          message = `The '${col.replace(/_/g, ' ')}' field is required`;
        }
      }

      // Improve 23505 (unique): name the duplicate field
      if (exception.code === '23505' && exception.detail) {
        const col = exception.detail.match(/Key \(([^)]+)\)/)?.[1];
        if (col)
          message = `A record with this ${col.replace(/_/g, ' ')} already exists`;
      }

      this.logger.error(
        `[${requestId}] DB ${exception.code} on ${method} ${path}: ${isProd ? message : (exception.detail ?? exception.message)}`,
        isProd
          ? undefined
          : String((exception as unknown as { stack?: string }).stack ?? ''),
      );

      // Unknown/unhandled errors — never leak internals in production
    } else {
      const err = exception as Error;
      this.logger.error(
        `[${requestId}] Unhandled exception on ${method} ${path}: ${err?.message ?? String(exception)}`,
        isProd ? undefined : err?.stack,
      );
      message = isProd
        ? 'Internal server error'
        : (err?.message ?? 'Unknown error');
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errors.length > 0 && { errors }),
      path,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

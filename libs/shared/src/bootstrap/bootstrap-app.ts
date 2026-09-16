import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';

export interface BootstrapOptions {
  serviceName: string;
  swaggerTitle: string;
  swaggerDescription: string;
  port: number | string;
  allowedOrigins?: string[];
  /** Set true only for billing/whatsapp which need raw body for webhook HMAC */
  rawBodyEnabled?: boolean;
}

export async function bootstrapApp(
  app: INestApplication,
  opts: BootstrapOptions,
): Promise<void> {
  const logger = new Logger(opts.serviceName);

  // ── Security headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false, // allow embedded resources (PDF reports etc)
    }),
  );

  // ── Request ID ──────────────────────────────────────────────────────────────
  const reqIdMiddleware = new RequestIdMiddleware();
  app.use((req: any, res: any, next: any) =>
    reqIdMiddleware.use(req, res, next),
  );

  // ── CORS ────────────────────────────────────────────────────────────────────
  const origins = opts.allowedOrigins?.length
    ? opts.allowedOrigins
    : (process.env.ALLOWED_ORIGINS ?? 'https://clinivio-frontend.vercel.app')
        .split(',')
        .map((s) => s.trim());

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, Postman, same-origin)
      if (
        !origin ||
        origins.includes(origin) ||
        process.env.NODE_ENV !== 'production'
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Tenant-ID',
      'X-Tenant-Slug',
    ],
    exposedHeaders: ['X-Request-ID'],
  });

  // ── Validation ──────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist strips un-decorated properties — our service DTOs are plain classes
      // (no class-validator decorators), so whitelist MUST be false or all body
      // properties would be stripped and every POST/PATCH would arrive empty.
      whitelist: false,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger ─────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle(opts.swaggerTitle)
    .setDescription(opts.swaggerDescription)
    .setVersion('1.0')
    .addBearerAuth()
    .addGlobalParameters({
      name: 'X-Request-ID',
      in: 'header',
      required: false,
      schema: {
        type: 'string',
        description: 'Idempotency / tracing request ID',
      },
    })
    .build();

  // Only expose Swagger in non-production (or explicitly enabled)
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true'
  ) {
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
    logger.log(`Swagger: http://localhost:${opts.port}/api/docs`);
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ── Start listening ──────────────────────────────────────────────────────────
  await app.listen(opts.port);
  logger.log(`${opts.serviceName} running on http://localhost:${opts.port}`);
}

import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { RequestIdMiddleware } from '../middleware/request-id.middleware';
import { isAllowedPlatformOrigin } from '../security/allowed-origin';

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
  // Every tenant gets its own subdomain (e.g. sndental.megnim.com), so CORS
  // can't be a fixed per-origin allowlist — it has to trust any subdomain of
  // the platform's base domain(s) while still rejecting look-alike origins
  // (see allowed-origin.ts for the specific spoofing patterns this blocks).
  // ALLOWED_ORIGINS stays as an explicit exact-match escape hatch for things
  // that aren't under the platform domain at all (e.g. a Vercel preview URL).
  const explicitOrigins = opts.allowedOrigins?.length
    ? opts.allowedOrigins
    : (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const platformDomains = (process.env.PLATFORM_DOMAINS ?? 'clinivio.ai,whizzon.ai')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // No Origin header at all means this isn't a browser CORS request
      // (server-to-server calls, curl, mobile apps, same-origin) — CORS is
      // a browser-enforced mechanism, so there's nothing to restrict here.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        callback(null, true); // dev/test convenience
        return;
      }

      if (
        explicitOrigins.includes(origin) ||
        isAllowedPlatformOrigin(origin, platformDomains)
      ) {
        callback(null, true);
      } else {
        logger.warn(`CORS: rejected origin ${origin}`);
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
  // Every request-body DTO across the app now has class-validator decorators
  // on every field, so whitelist/forbidNonWhitelisted can be safely enforced:
  // unknown/extra properties in a request body are rejected outright instead
  // of silently passing through to services/TypeORM.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
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

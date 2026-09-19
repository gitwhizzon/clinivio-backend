import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrapApp } from '@mediflow/shared';

function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Every JwtStrategy/JwtModule call site falls back to a hardcoded
    // 'dev-secret' when these are unset — fine for local dev, but in
    // production that would mean every deploy uses the same publicly-known
    // secret to sign auth tokens. Fail fast instead of booting insecurely.
    throw new Error(
      `Refusing to start in production without: ${missing.join(', ')}`,
    );
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await bootstrapApp(app, {
    serviceName: 'MegnimAPI',
    swaggerTitle: 'Megnim API',
    swaggerDescription: 'Unified Hospital Management System API',
    port: process.env.PORT ?? '3000',
    rawBodyEnabled: true,
  });
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrapApp } from '@mediflow/shared';

async function bootstrap() {
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

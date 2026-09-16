import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

import { DatabaseModule } from '@mediflow/database';
import configuration from './config/configuration';

// Core / Cross-cutting
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';

// IAM
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

// Clinical
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SlotsModule } from './slots/slots.module';
import { DepartmentsModule } from './departments/departments.module';
import { ConsultationModule } from './consultation/consultation.module';

// Clinical support
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { RoomsModule } from './rooms/rooms.module';
import { IpdModule } from './ipd/ipd.module';
import { LabModule } from './lab/lab.module';

// Billing
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { BillableServicesModule } from './billable-services/billable-services.module';

// Notifications & Messaging
import { EmailModule } from './email/email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './notifications/reminders/reminder.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

// Analytics
import { StatsModule } from './stats/stats.module';
import { AnalyticsModule } from './analytics/analytics.module';

// Patient Portal
import { PatientPortalModule } from './patient-portal/patient-portal.module';

// Audit
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';

// AI
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    // ── Configuration (global) ──────────────────────────────────────────────────
    // Search for .env.local / .env both in the app dir AND the monorepo root
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [
        '.env.local',
        '.env',
        '../../.env.local', // monorepo root (apps/api → root)
        '../../.env',
      ],
    }),

    // ── Database (global — TypeORM connection pool) ─────────────────────────────
    DatabaseModule,

    // ── Rate limiting ───────────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl') ?? 60000,
            limit: config.get<number>('throttle.limit') ?? 120,
          },
        ],
      }),
    }),

    // ── Task scheduling (cron jobs) ─────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Bull / Redis queue ──────────────────────────────────────────────────────
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('redis.url');
        if (redisUrl) {
          return { url: redisUrl };
        }
        return {
          redis: {
            host: config.get<string>('redis.host') ?? 'localhost',
            port: config.get<number>('redis.port') ?? 6379,
          },
        };
      },
    }),

    // ── Core infra ──────────────────────────────────────────────────────────────
    HealthModule,
    KafkaModule,

    // ── IAM ─────────────────────────────────────────────────────────────────────
    AuthModule,
    TenantsModule,
    UsersModule,

    // ── Clinical ─────────────────────────────────────────────────────────────────
    PatientsModule,
    AppointmentsModule,
    SlotsModule,
    DepartmentsModule,
    ConsultationModule,

    // ── Clinical support ─────────────────────────────────────────────────────────
    PharmacyModule,
    RoomsModule,
    IpdModule,
    LabModule,

    // ── Billing ───────────────────────────────────────────────────────────────────
    InvoicesModule,
    PaymentsModule,
    BillableServicesModule,

    // ── Notifications & Messaging ─────────────────────────────────────────────────
    EmailModule,
    NotificationsModule,
    RemindersModule,
    WhatsappModule,

    // ── Analytics ────────────────────────────────────────────────────────────────
    StatsModule,
    AnalyticsModule,

    // ── Patient Portal ────────────────────────────────────────────────────────────
    PatientPortalModule,

    // ── Audit Trail ───────────────────────────────────────────────────────────────
    AuditModule,

    // ── AI Clinical Summary ───────────────────────────────────────────────────────
    AiModule,
  ],
  providers: [
    // Global audit interceptor — logs all mutating HTTP requests automatically.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant-context middleware to ALL routes.
    // Routes without a recognised tenant slug simply get no ALS context (no-op).
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

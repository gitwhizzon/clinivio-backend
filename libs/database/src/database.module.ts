import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ALL_ENTITIES } from './entities';
import { TenantDataSourceRegistry } from './tenant-datasource.registry';
import { TenantEntityManager } from './tenant-entity-manager';

/**
 * Global DatabaseModule — import once in AppModule.
 *
 * Provides two layers:
 *  1. Platform DataSource (TypeORM forRoot) — connects to Neon, public schema.
 *     Used for Tenant CRUD and SUPER_ADMIN auth.
 *  2. TenantDataSourceRegistry — manages per-tenant DataSources (one per slug).
 *     Uses AsyncLocalStorage to propagate the active tenant context through the request chain.
 *  3. TenantEntityManager — global singleton wrapper; auto-routes to the current tenant's DS.
 *     Inject this in all feature services instead of @InjectRepository().
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl =
          config.get<string>('DATABASE_URL') || process.env.DATABASE_URL;
        if (!dbUrl) throw new Error('DATABASE_URL is not set');
        return {
          type: 'postgres',
          url: dbUrl,
          entities: ALL_ENTITIES,
          // Auto-sync in dev or when DB_SYNC=true (one-time bootstrap for fresh DBs).
          synchronize:
            process.env.NODE_ENV !== 'production' ||
            process.env.DB_SYNC === 'true',
          dropSchema:
            process.env.NODE_ENV !== 'production' &&
            process.env.DB_RESET === 'true',
          migrations: [
            process.env.NODE_ENV === 'production'
              ? 'apps/api/dist/migrations/*.js'
              : 'apps/api/src/migrations/*.ts',
          ],
          migrationsRun: process.env.NODE_ENV === 'production',
          ssl:
            process.env.NODE_ENV === 'production'
              ? { rejectUnauthorized: false }
              : false,
          logging:
            process.env.LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
          retryAttempts: 20,
          retryDelay: 3000,
          extra: {
            max: 5,
            min: 0,
            idleTimeoutMillis: 5000,
            connectionTimeoutMillis: 60000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          },
        };
      },
    }),
  ],
  providers: [TenantDataSourceRegistry, TenantEntityManager],
  exports: [TypeOrmModule, TenantDataSourceRegistry, TenantEntityManager],
})
export class DatabaseModule {}

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource } from 'typeorm';

interface TenantMarker {
  tenantId: string;
  slug: string;
}

/**
 * All hospitals share one Postgres schema (`public`); rows are isolated by
 * the `tenantId` column on every tenant-scoped entity (see TenantEntityManager
 * for the auto-scoping safety net). This registry no longer builds a
 * DataSource per tenant — it just tracks which tenant is "current" for the
 * request via AsyncLocalStorage, and always hands back the one shared
 * platform DataSource.
 *
 * The public API (`getOrCreate`, `current`, `currentOrNull`, `runWithTenant`,
 * `getAll`, `evict`) is unchanged so every existing call site keeps working.
 */
@Injectable()
export class TenantDataSourceRegistry {
  private readonly logger = new Logger(TenantDataSourceRegistry.name);

  /** ALS store: which tenant is "current" for this async context */
  readonly als = new AsyncLocalStorage<TenantMarker>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Wraps the request handler chain in the tenant marker's ALS context.
   * Called by TenantContextMiddleware for every incoming request.
   */
  async runWithTenant(
    tenantId: string,
    slug: string,
    fn: () => void,
  ): Promise<void> {
    this.als.run({ tenantId, slug }, fn);
  }

  /**
   * Returns the shared DataSource. Throws if no tenant context has been
   * established for the current async context.
   */
  get current(): DataSource {
    if (!this.als.getStore()) {
      throw new Error(
        'TenantDataSourceRegistry: no tenant context. ' +
          'Ensure TenantContextMiddleware is applied and the route carries a tenant slug.',
      );
    }
    return this.dataSource;
  }

  /**
   * Returns null instead of throwing — useful for platform-level (super-admin) code
   * that may legitimately run without a tenant context.
   */
  get currentOrNull(): DataSource | null {
    return this.als.getStore() ? this.dataSource : null;
  }

  /** The tenantId of the current async context, if any. */
  get currentTenantId(): string | null {
    return this.als.getStore()?.tenantId ?? null;
  }

  /**
   * Returns the shared platform DataSource — kept for backward compatibility
   * with existing call sites that resolve a tenant's DataSource explicitly.
   */
  async getOrCreate(tenantId: string, slug: string): Promise<DataSource> {
    if (!this.dataSource.isInitialized) {
      this.logger.warn(
        `Platform DataSource not initialized when resolving tenant '${slug}'`,
      );
    }
    return this.dataSource;
  }

  /**
   * Returns the shared DataSource as a single-element array — preserves the
   * shape expected by existing cross-tenant loops (they now naturally query
   * the one shared table instead of iterating per-tenant DataSources).
   */
  getAll(): DataSource[] {
    return this.dataSource.isInitialized ? [this.dataSource] : [];
  }

  /**
   * No-op — there is no per-tenant DataSource to destroy anymore. Kept so
   * existing callers (e.g. on tenant deactivate/delete) don't need changes.
   */
  async evict(_tenantId: string): Promise<void> {
    // intentionally empty
  }
}

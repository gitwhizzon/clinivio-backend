import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog, Tenant, TenantDataSourceRegistry } from '@mediflow/database';

export interface AuditEntry {
  tenantId?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  description?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  success?: boolean;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectDataSource() private readonly platformDs: DataSource,
    private readonly registry: TenantDataSourceRegistry,
  ) {}

  /** Fire-and-forget — never throws, never blocks the main request. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      // Use the current request's tenant DS (from ALS) if available — the
      // audit_logs table is guaranteed to exist there via synchronize:true.
      // Fall back to the platform DS for super-admin / unauthenticated paths.
      const ds = this.registry.currentOrNull ?? this.platformDs;
      await ds.getRepository(AuditLog).save({
        ...entry,
        success: entry.success ?? true,
      });
    } catch (err: any) {
      console.error('[Audit] write failed:', err?.message);
    }
  }

  async findAll(
    tenantId: string,
    filters: {
      action?: string;
      entityType?: string;
      userId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      page = 1,
      limit = 50,
      action,
      entityType,
      userId,
      from,
      to,
    } = filters;
    const safeLimit = Math.min(limit, 100);

    // Resolve the tenant's schema DataSource so we query audit_logs from the
    // schema where it was actually written (synchronize:true ensures it exists).
    const ds = await this.resolveTenantDs(tenantId);

    const qb = ds
      .getRepository(AuditLog)
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * safeLimit)
      .take(safeLimit);

    if (action) qb.andWhere('log.action = :action', { action });
    if (entityType) qb.andWhere('log.entityType = :entityType', { entityType });
    if (userId) qb.andWhere('log.userId = :userId', { userId });
    if (from) qb.andWhere('log.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('log.createdAt <= :to', { to: new Date(to) });

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  private async resolveTenantDs(tenantId: string): Promise<DataSource> {
    // Look up the tenant slug from the platform DB so we can open (or reuse) its
    // schema DataSource.  getOrCreate is idempotent — returns from cache if already
    // initialized, so this is cheap for any tenant that had a recent request.
    const tenant = await this.platformDs.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: ['id', 'slug'],
    });
    if (tenant?.slug) {
      // Cast: pnpm resolves typeorm to two separate package instances (one for
      // ioredis peers, one for pg peers); the DataSource shapes are identical at
      // runtime. The cast removes the spurious structural-incompatibility error.
      return this.registry.getOrCreate(
        tenantId,
        tenant.slug,
      ) as unknown as DataSource;
    }
    return this.platformDs;
  }
}

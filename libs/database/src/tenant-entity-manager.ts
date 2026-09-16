import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { TenantDataSourceRegistry } from './tenant-datasource.registry';
import { ALL_ENTITIES, Tenant } from './entities';

/**
 * Every entity except `Tenant` itself carries a `tenantId` column and is
 * scoped per-hospital. `Tenant` is the organization table — it has no
 * tenantId of its own.
 */
const TENANT_SCOPED_ENTITIES = new Set<unknown>(
  ALL_ENTITIES.filter((entity) => entity !== Tenant),
);

function withTenantScope<T extends ObjectLiteral>(
  where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  tenantId: string,
): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
  if (Array.isArray(where)) {
    return where.map((w) => ({ ...w, tenantId }) as FindOptionsWhere<T>);
  }
  return { ...(where ?? {}), tenantId } as unknown as FindOptionsWhere<T>;
}

/**
 * Wraps a Repository so find/findOne/findOneBy/count/findAndCount always
 * merge `tenantId` into the where clause — a safety net on top of the
 * explicit tenantId filtering every service already performs. Does NOT
 * touch createQueryBuilder()/update()/delete(): those remain the caller's
 * responsibility (see TenantEntityManager.qb doc comment).
 */
function scopeRepository<T extends ObjectLiteral>(
  repo: Repository<T>,
  tenantId: string,
): Repository<T> {
  const overrides: Record<string, (...args: any[]) => any> = {
    find: (options?: FindManyOptions<T>) =>
      repo.find({
        ...options,
        where: withTenantScope(options?.where, tenantId),
      }),
    findOne: (options: FindOneOptions<T>) =>
      repo.findOne({
        ...options,
        where: withTenantScope(options?.where as any, tenantId),
      } as FindOneOptions<T>),
    findOneBy: (where: FindOptionsWhere<T> | FindOptionsWhere<T>[]) =>
      repo.findOneBy(withTenantScope(where, tenantId) as any),
    count: (options?: FindManyOptions<T>) =>
      repo.count({
        ...options,
        where: withTenantScope(options?.where, tenantId),
      }),
    findAndCount: (options?: FindManyOptions<T>) =>
      repo.findAndCount({
        ...options,
        where: withTenantScope(options?.where, tenantId),
      }),
  };

  return new Proxy(repo, {
    get(target, prop, _receiver) {
      if (typeof prop === 'string' && prop in overrides) {
        return overrides[prop];
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Repository<T>;
}

/**
 * Thin wrapper over the current request's tenant DataSource.
 *
 * Inject this ONCE in any service instead of multiple @InjectRepository() calls.
 * Tenant-scoped entities are automatically filtered by the current tenantId
 * on find/findOne/findOneBy/count/findAndCount as a safety net — services
 * should still pass tenantId explicitly (existing convention), this just
 * guards against an omission leaking cross-tenant rows.
 *
 * Usage:
 *   constructor(private db: TenantEntityManager) {}
 *
 *   async findUsers() {
 *     return this.db.repo(User).find();
 *   }
 *
 *   async inTransaction() {
 *     return this.db.transaction(async (em) => {
 *       await em.save(User, { ... });
 *     });
 *   }
 */
@Injectable()
export class TenantEntityManager {
  constructor(private readonly registry: TenantDataSourceRegistry) {}

  // ── Core accessors ────────────────────────────────────────────────────────

  get ds(): DataSource {
    return this.registry.current;
  }

  get manager(): EntityManager {
    return this.registry.current.manager;
  }

  // ── Repository shortcuts ──────────────────────────────────────────────────

  repo<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    const raw = this.registry.current.getRepository(entity);
    const tenantId = this.registry.currentTenantId;
    if (tenantId && TENANT_SCOPED_ENTITIES.has(entity)) {
      return scopeRepository(raw, tenantId);
    }
    return raw;
  }

  /**
   * Raw query builder — NOT auto-scoped by tenantId. Callers must add their
   * own `.andWhere('<alias>.tenantId = :tenantId', { tenantId })` (existing
   * convention across the codebase) since safely composing a tenant filter
   * onto an arbitrary caller-built query isn't possible (a later `.where()`
   * call would clobber it).
   */
  qb<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    alias: string,
  ): SelectQueryBuilder<T> {
    return this.registry.current
      .getRepository(entity)
      .createQueryBuilder(alias);
  }

  // ── Convenience find wrappers (optional) ─────────────────────────────────

  find<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    options?: FindManyOptions<T>,
  ): Promise<T[]> {
    return this.repo(entity).find(options);
  }

  findOne<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    options: FindOneOptions<T>,
  ): Promise<T | null> {
    return this.repo(entity).findOne(options);
  }

  count<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    options?: FindManyOptions<T>,
  ): Promise<number> {
    return this.repo(entity).count(options);
  }

  save<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    data: T | T[],
  ): Promise<T | T[]> {
    return this.repo(entity).save(data as any) as any;
  }

  // ── Transaction helper ────────────────────────────────────────────────────

  transaction<T>(fn: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.registry.current.transaction(fn);
  }
}

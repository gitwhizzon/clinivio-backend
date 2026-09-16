// Database module
export { DatabaseModule } from './database.module';

// All entities + enums
export * from './entities';

// Multi-tenant infrastructure
export { TenantDataSourceRegistry } from './tenant-datasource.registry';
export { TenantEntityManager } from './tenant-entity-manager';

// Re-export TypeORM operators so all app code resolves them through the same
// TypeORM instance as the compiled entity types (avoids pnpm peer-dep duplication).
export {
  ILike,
  In,
  MoreThanOrEqual,
  LessThanOrEqual,
  MoreThan,
  LessThan,
  Between,
  Not,
  IsNull,
  Like,
  Raw,
  FindOperator,
} from 'typeorm';
export type {
  FindOptionsWhere,
  FindManyOptions,
  FindOneOptions,
  Repository,
  DataSource,
  EntityManager,
  SelectQueryBuilder,
} from 'typeorm';

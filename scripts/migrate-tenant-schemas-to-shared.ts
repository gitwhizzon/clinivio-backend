/**
 * One-off migration: copies every row out of each per-hospital
 * `tenant_<slug>` Postgres schema into the shared `public` tables,
 * now that the app routes all tenants through one shared DataSource
 * (tenantId column instead of a dedicated schema per hospital).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-tenant-schemas-to-shared.ts
 *
 * This script is READ-then-INSERT only — it never touches or drops the
 * old `tenant_<slug>` schemas. After running, manually verify row counts
 * and spot-check a few records in the UI, then drop the old schemas
 * yourself with an explicit `DROP SCHEMA "tenant_xxx" CASCADE` per schema
 * once you're confident the migration is correct.
 *
 * Safe to re-run: every insert uses `ON CONFLICT (id) DO NOTHING`.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { ALL_ENTITIES, Tenant } from '../libs/database/src/entities';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set in environment');

  const isProd = process.env.NODE_ENV === 'production';

  const ds = new DataSource({
    type: 'postgres',
    url: dbUrl,
    entities: ALL_ENTITIES,
    synchronize: false,
    ssl: isProd ? { rejectUnauthorized: false } : false,
  });

  await ds.initialize();
  console.log(
    '\n🔀  Migrating tenant schemas into the shared public schema...\n',
  );

  // ── 1. Find every tenant_% schema ─────────────────────────────────────────
  const schemas: { schema_name: string }[] = await ds.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`,
  );

  if (schemas.length === 0) {
    console.log('No tenant_% schemas found — nothing to migrate.\n');
    await ds.destroy();
    return;
  }

  console.log(
    `Found ${schemas.length} tenant schema(s): ${schemas.map((s) => s.schema_name).join(', ')}\n`,
  );

  // Tenant rows already live in public — nothing to copy for that entity.
  const tableEntities = ALL_ENTITIES.filter((e) => e !== Tenant);
  const mismatches: string[] = [];

  for (const { schema_name: schema } of schemas) {
    const slug = schema.replace(/^tenant_/, '');
    console.log(`── ${schema} ──────────────────────────────────────────`);

    for (const entity of tableEntities) {
      const meta = ds.getMetadata(entity);
      const table = meta.tableName;

      // Skip if the table doesn't exist in this tenant's schema (older tenants
      // may predate newer entities).
      const tableExists: { exists: boolean }[] = await ds.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2
         ) AS exists`,
        [schema, table],
      );
      if (!tableExists[0]?.exists) continue;

      const srcCountRes = await ds.query(
        `SELECT COUNT(*)::int AS count FROM "${schema}"."${table}"`,
      );
      const srcCount = srcCountRes[0].count;
      if (srcCount === 0) continue;

      await ds.query(
        `INSERT INTO public."${table}" SELECT * FROM "${schema}"."${table}" ON CONFLICT (id) DO NOTHING`,
      );

      const dstCountRes = await ds.query(
        `SELECT COUNT(*)::int AS count FROM public."${table}" WHERE "tenantId" = $1`,
        [
          (
            await ds.query(`SELECT id FROM public.tenants WHERE slug = $1`, [
              slug,
            ])
          )[0]?.id,
        ],
      );
      const dstCount = dstCountRes[0]?.count ?? 0;

      const status = dstCount >= srcCount ? '✓' : '✗ MISMATCH';
      console.log(
        `  ${status}  ${table.padEnd(28)} src=${srcCount}  dst(tenant rows)=${dstCount}`,
      );

      if (dstCount < srcCount) {
        mismatches.push(`${schema}.${table}: src=${srcCount} dst=${dstCount}`);
      }
    }
    console.log('');
  }

  if (mismatches.length) {
    console.log(
      '⚠️  Mismatches detected — investigate before dropping old schemas:',
    );
    mismatches.forEach((m) => console.log(`   - ${m}`));
  } else {
    console.log('✅  All tables migrated with matching row counts.');
  }
  console.log(
    '\nOld tenant_<slug> schemas were NOT dropped. Verify the data, then drop them manually.\n',
  );

  await ds.destroy();
}

main().catch((e) => {
  console.error('\n❌  Migration failed:', e.message);
  process.exit(1);
});

/**
 * TypeORM database seed script.
 *
 * Run:
 *   pnpm db:seed
 *
 * Creates / updates:
 *   - Clinivio Platform tenant + SUPER_ADMIN in public schema only.
 *
 * No sample hospital tenants are seeded — onboard real hospitals through the
 * SuperAdmin UI at /hospitals after logging in with superadmin@whizzon.ai.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { Tenant, User, SubscriptionTier, Role } from './entities';
import { ALL_ENTITIES } from './entities';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// ─── Stable IDs ───────────────────────────────────────────────────────────────
const PLATFORM_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PLATFORM_ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';

async function hash(password: string) {
  return bcrypt.hash(password, 12);
}

async function upsertTenant(
  tenantRepo: any,
  id: string,
  data: Partial<Tenant>,
): Promise<void> {
  const existing = await tenantRepo.findOne({ where: { id } });
  if (existing) {
    const patches: Partial<Tenant> = {};
    for (const [key, value] of Object.entries(data)) {
      if ((existing as any)[key] == null && value != null) {
        (patches as any)[key] = value;
      }
    }
    if (Object.keys(patches).length) await tenantRepo.update(id, patches);
  } else {
    await tenantRepo.save(tenantRepo.create({ id, ...data }));
  }
}

async function upsertUser(
  userRepo: any,
  lookup: Partial<User>,
  data: Partial<User>,
): Promise<void> {
  const existing = await userRepo.findOne({ where: lookup });
  if (!existing) {
    await userRepo.save(userRepo.create({ ...lookup, ...data }));
  }
}

function makeSslOption(isProd: boolean) {
  return isProd ? { rejectUnauthorized: false } : false;
}

async function main() {
  const isProd = process.env.NODE_ENV === 'production';
  const dbUrl = process.env.DATABASE_URL!;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const platformDs = new DataSource({
    type: 'postgres',
    url: dbUrl,
    entities: ALL_ENTITIES,
    synchronize: !isProd,
    ssl: makeSslOption(isProd),
  });
  await platformDs.initialize();
  console.log('🌱  Seeding database...\n');

  const tenantRepo = platformDs.getRepository(Tenant);
  const platformUserRepo = platformDs.getRepository(User);

  // ── Clinivio Platform tenant (public schema) ──────────────────────────────
  await upsertTenant(tenantRepo, PLATFORM_TENANT_ID, {
    name: 'Clinivio Platform',
    subscriptionTier: SubscriptionTier.ENTERPRISE,
    isActive: true,
  });

  // ── Platform SUPER_ADMIN ──────────────────────────────────────────────────
  await upsertUser(
    platformUserRepo,
    { id: PLATFORM_ADMIN_ID },
    {
      tenantId: PLATFORM_TENANT_ID,
      email: 'superadmin@whizzon.ai',
      passwordHash: await hash('SuperAdmin@123'),
      firstName: 'Whizzon',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  );
  console.log(
    '  ✓ SUPER_ADMIN   superadmin@whizzon.ai  (SuperAdmin@123)  [public schema]',
  );

  console.log('');
  console.log('✅  Seed complete!\n');
  console.log('  Platform login:');
  console.log(
    '    POST /auth/login  { "email": "superadmin@whizzon.ai", "password": "SuperAdmin@123" }',
  );
  console.log('');
  console.log(
    '  Onboard hospitals via the SuperAdmin UI → /hospitals → "+ Onboard Hospital"',
  );

  await platformDs.destroy();
}

main().catch((e) => {
  console.error('\n❌  Seed failed:', e.message, e.stack);
  process.exit(1);
});

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Tenant,
  User,
  Role,
  TenantDataSourceRegistry,
  ALL_ENTITIES,
} from '@mediflow/database';
import { RESERVED_TENANT_SLUGS } from '@mediflow/shared';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectDataSource() private readonly platformDs: DataSource,
    private readonly registry: TenantDataSourceRegistry,
    private readonly whatsappService: WhatsappService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  findAll() {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findAllWithStats() {
    const tenants = await this.tenantRepo.find({
      order: { createdAt: 'DESC' },
    });

    // whatsappAccessToken is select:false on the entity so it never leaks
    // into a normal find() response — fetch it separately just to compute
    // a boolean "is this tenant using its own token" flag, then discard it.
    const tokenRows = await this.tenantRepo
      .createQueryBuilder('tenant')
      .select(['tenant.id', 'tenant.whatsappAccessToken'])
      .getMany();
    const hasOwnToken = new Map(
      tokenRows.map((t) => [t.id, !!t.whatsappAccessToken]),
    );

    return Promise.all(
      tenants.map(async (t) => {
        // Skip the platform tenant (slug = null) — it has no tenant schema
        if (!t.slug) {
          return {
            ...t,
            userCount: 0,
            adminEmail: null,
            adminName: null,
            adminLastLogin: null,
            hasWhatsappAccessToken: hasOwnToken.get(t.id) ?? false,
          };
        }
        try {
          const [userCount, adminUser] = await Promise.all([
            this.platformDs
              .getRepository(User)
              .count({ where: { tenantId: t.id, isActive: true } }),
            this.platformDs.getRepository(User).findOne({
              where: { tenantId: t.id, role: Role.ADMIN },
              select: ['email', 'firstName', 'lastName', 'lastLoginAt'],
            }),
          ]);
          return {
            ...t,
            userCount,
            adminEmail: adminUser?.email ?? null,
            adminName: adminUser
              ? `${adminUser.firstName} ${adminUser.lastName}`
              : null,
            adminLastLogin: adminUser?.lastLoginAt ?? null,
            hasWhatsappAccessToken: hasOwnToken.get(t.id) ?? false,
          };
        } catch {
          return {
            ...t,
            userCount: 0,
            adminEmail: null,
            adminName: null,
            adminLastLogin: null,
            hasWhatsappAccessToken: hasOwnToken.get(t.id) ?? false,
          };
        }
      }),
    );
  }

  async findById(id: string) {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * Runs a handful of cheap, read-only checks against a freshly-onboarded
   * tenant so a problem (subdomain not resolving yet, WhatsApp credentials
   * that don't actually work) surfaces immediately instead of the first
   * time the hospital's own staff try to use it. Nothing here is
   * destructive and nothing sends a real message — verifyCredentials() is
   * a read-only GET against the phone number's own resource.
   */
  async verifySetup(id: string) {
    const tenant = await this.findById(id);

    const adminCount = tenant.slug
      ? await this.platformDs.getRepository(User).count({
          where: { tenantId: tenant.id, role: Role.ADMIN, isActive: true },
        })
      : 0;

    const checks: { name: string; status: 'ok' | 'warn' | 'fail'; detail: string }[] = [];

    checks.push({
      name: 'Tenant active',
      status: tenant.isActive ? 'ok' : 'fail',
      detail: tenant.isActive ? 'Tenant is active' : 'Tenant is marked inactive',
    });

    checks.push({
      name: 'Admin account',
      status: adminCount > 0 ? 'ok' : 'fail',
      detail:
        adminCount > 0
          ? `${adminCount} active ADMIN account(s)`
          : 'No active ADMIN account for this tenant — staff cannot log in yet',
    });

    if (tenant.slug) {
      const domain = this.primaryPlatformDomain();
      const hostname = `${tenant.slug}.${domain}`;
      try {
        const dns = await import('dns');
        await dns.promises.resolve(hostname);
        checks.push({
          name: 'Subdomain DNS',
          status: 'ok',
          detail: `${hostname} resolves`,
        });
      } catch {
        checks.push({
          name: 'Subdomain DNS',
          status: 'warn',
          detail: `${hostname} does not resolve yet — expected until the *.${domain} wildcard domain is set up; not an application problem`,
        });
      }
    }

    if (tenant.whatsappPhoneNumberId) {
      const tenantWithToken = await this.tenantRepo
        .createQueryBuilder('tenant')
        .addSelect('tenant.whatsappAccessToken')
        .where('tenant.id = :id', { id })
        .getOne();

      const result = await this.whatsappService.verifyCredentials({
        phoneNumberId: tenant.whatsappPhoneNumberId,
        accessToken: tenantWithToken?.whatsappAccessToken ?? undefined,
      });
      checks.push({
        name: 'WhatsApp (own number)',
        status: result.ok ? 'ok' : 'fail',
        detail: result.detail,
      });
    } else {
      const result = await this.whatsappService.verifyCredentials();
      checks.push({
        name: 'WhatsApp (platform-shared number)',
        status: result.ok ? 'ok' : 'warn',
        detail: result.ok
          ? 'Using the shared platform WhatsApp number — verified working'
          : `Using the shared platform WhatsApp number, but it isn't configured/working either: ${result.detail}`,
      });
    }

    const overall = checks.some((c) => c.status === 'fail')
      ? 'fail'
      : checks.some((c) => c.status === 'warn')
        ? 'warn'
        : 'ok';

    return { tenantId: id, overall, checks };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(dto: CreateTenantDto) {
    // 1. Derive slug
    const slug = dto.slug
      ? dto.slug.toLowerCase()
      : this.generateSlug(dto.name);

    // 2. Reject a slug that collides with a reserved platform subdomain
    // (app/api/www/admin.megnim.com) — both the frontend and the backend's
    // own TenantContextMiddleware treat those as platform-only *before*
    // ever checking whether a tenant exists, so a tenant created with one
    // of these slugs would be silently, permanently unreachable at its own
    // subdomain. Must be caught here, at creation time — there's no way to
    // detect or fix it later from the outside.
    if ((RESERVED_TENANT_SLUGS as readonly string[]).includes(slug)) {
      throw new BadRequestException(
        dto.slug
          ? `Slug '${slug}' is reserved for the platform and can't be used for a hospital. Please choose a different Hospital ID.`
          : `Hospital name generates the reserved slug '${slug}'. Please provide a Hospital ID manually.`,
      );
    }

    // 3. Ensure uniqueness
    const existing = await this.tenantRepo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Tenant slug '${slug}' is already taken`);
    }

    // 4. Persist tenant record in platform (public) schema
    const tenant = await this.tenantRepo.save(
      this.tenantRepo.create({
        name: dto.name,
        slug,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        gstin: dto.gstin,
        drugLicenseNo: dto.drugLicenseNo,
        whatsappPhoneNumberId: dto.whatsappPhoneNumberId,
        wabaId: dto.wabaId,
        whatsappAccessToken: dto.whatsappAccessToken ?? null,
        subscriptionTier: (dto.subscriptionTier as any) ?? 'BASIC',
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        registrationNo: dto.registrationNo,
        tagline: dto.tagline,
        printHeader: dto.printHeader,
        pharmacyName: dto.pharmacyName,
        portalUrl: dto.portalUrl ?? `https://${slug}.${this.primaryPlatformDomain()}`,
      }),
    );

    // 5. All hospitals share the platform DataSource — no per-tenant schema.
    const tenantDs = await this.registry.getOrCreate(tenant.id, slug);

    // 6. Seed the admin user, scoped by tenantId
    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);
    const admin = await tenantDs.getRepository(User).save(
      tenantDs.getRepository(User).create({
        tenantId: tenant.id,
        email: dto.adminEmail,
        passwordHash,
        firstName: dto.adminFirstName,
        lastName: dto.adminLastName,
        phone: dto.adminPhone,
        role: Role.ADMIN,
      }),
    );

    return {
      tenant,
      credentials: {
        email: dto.adminEmail,
        password: dto.adminPassword,
        tenantId: tenant.id,
        tenantSlug: slug,
        portalUrl: tenant.portalUrl,
        adminName: `${dto.adminFirstName} ${dto.adminLastName}`,
      },
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      },
    };
  }

  /**
   * Update any combination of tenant profile fields and/or admin user credentials.
   * SuperAdmin can change everything that was set during onboarding in a single call.
   */
  async update(id: string, data: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);

    // ── 1. Tenant profile fields ────────────────────────────────────────────
    const tenantPatch: Partial<Tenant> = {};
    const str = (v: string | undefined) => v !== undefined;
    if (str(data.name)) tenantPatch.name = data.name!;
    if (str(data.address)) tenantPatch.address = data.address!;
    if (str(data.city)) tenantPatch.city = data.city!;
    if (str(data.state)) tenantPatch.state = data.state!;
    if (str(data.stateCode)) tenantPatch.stateCode = data.stateCode!;
    if (str(data.pincode)) tenantPatch.pincode = data.pincode!;
    if (str(data.gstin)) tenantPatch.gstin = data.gstin!;
    if (data.cgstRate !== undefined)
      tenantPatch.cgstRate = String(data.cgstRate);
    if (data.sgstRate !== undefined)
      tenantPatch.sgstRate = String(data.sgstRate);
    if (data.igstRate !== undefined)
      tenantPatch.igstRate = String(data.igstRate);
    if (str(data.drugLicenseNo))
      tenantPatch.drugLicenseNo = data.drugLicenseNo!;
    if (str(data.abhaHipId)) tenantPatch.abhaHipId = data.abhaHipId!;
    if (data.clearWhatsappConfig) {
      // Explicit removal takes priority over any whatsapp* fields sent in
      // the same request — reverts this tenant to the platform-shared number.
      tenantPatch.whatsappPhoneNumberId = null;
      tenantPatch.wabaId = null;
      tenantPatch.whatsappAccessToken = null;
    } else {
      if (str(data.whatsappPhoneNumberId))
        tenantPatch.whatsappPhoneNumberId = data.whatsappPhoneNumberId!;
      if (str(data.wabaId)) tenantPatch.wabaId = data.wabaId!;
      if (str(data.whatsappAccessToken))
        tenantPatch.whatsappAccessToken = data.whatsappAccessToken!;
    }
    if (str(data.phone)) tenantPatch.phone = data.phone!;
    if (str(data.email)) tenantPatch.email = data.email!;
    if (str(data.website)) tenantPatch.website = data.website!;
    if (str(data.registrationNo))
      tenantPatch.registrationNo = data.registrationNo!;
    if (str(data.tagline)) tenantPatch.tagline = data.tagline!;
    if (str(data.printHeader)) tenantPatch.printHeader = data.printHeader!;
    if (str(data.logoUrl)) tenantPatch.logoUrl = data.logoUrl!;
    if (str(data.pharmacyName)) tenantPatch.pharmacyName = data.pharmacyName!;
    if (str(data.portalUrl)) tenantPatch.portalUrl = data.portalUrl!;
    if (data.subscriptionTier !== undefined)
      tenantPatch.subscriptionTier = data.subscriptionTier as any;
    if (data.isActive !== undefined) tenantPatch.isActive = data.isActive;
    if (data.allowConsultationBeforePayment !== undefined)
      tenantPatch.allowConsultationBeforePayment =
        data.allowConsultationBeforePayment;

    if (Object.keys(tenantPatch).length) {
      await this.tenantRepo.update(id, tenantPatch);
    }

    // ── 2. Admin user fields (only if any admin field was supplied) ──────────
    const hasAdminUpdate =
      data.adminEmail !== undefined ||
      data.adminPassword !== undefined ||
      data.adminFirstName !== undefined ||
      data.adminLastName !== undefined ||
      data.adminPhone !== undefined;

    if (hasAdminUpdate) {
      if (!tenant.slug) {
        throw new ConflictException(
          'Cannot update admin user for the platform tenant via this endpoint',
        );
      }
      const tenantDs = await this.registry.getOrCreate(id, tenant.slug);
      const userRepo = tenantDs.getRepository(User);

      const admin = await userRepo.findOne({
        where: { tenantId: id, role: Role.ADMIN, isActive: true },
      });
      if (!admin) {
        throw new NotFoundException(
          'No active ADMIN user found for this tenant',
        );
      }

      const userPatch: Partial<User> = {};
      if (str(data.adminEmail)) userPatch.email = data.adminEmail!;
      if (str(data.adminFirstName)) userPatch.firstName = data.adminFirstName!;
      if (str(data.adminLastName)) userPatch.lastName = data.adminLastName!;
      if (str(data.adminPhone)) userPatch.phone = data.adminPhone!;
      if (str(data.adminPassword))
        userPatch.passwordHash = await bcrypt.hash(data.adminPassword!, 12);

      await userRepo.update(admin.id, userPatch);
      this.logger.log(`Updated admin user ${admin.id} for tenant ${id}`);
    }

    return this.findById(id);
  }

  async deactivate(id: string) {
    await this.findById(id); // throws NotFoundException if tenant doesn't exist
    await this.tenantRepo.update(id, { isActive: false });
    // Evict the cached DataSource so it closes connections
    await this.registry.evict(id);
    return this.findById(id);
  }

  /**
   * Permanently deletes a tenant — removes every row scoped to this tenantId
   * across all shared tables, then the public.tenants row itself.
   * The platform tenant (slug = null) cannot be deleted.
   */
  async delete(id: string): Promise<{ message: string }> {
    const tenant = await this.findById(id);

    if (!tenant.slug) {
      throw new ForbiddenException('The platform tenant cannot be deleted');
    }

    await this.registry.evict(id);

    // Delete child→parent (reverse of ALL_ENTITIES' parent→child order) so
    // FK-style references never get orphaned mid-transaction.
    await this.platformDs.transaction(async (manager) => {
      for (const entity of [...ALL_ENTITIES].reverse()) {
        if (entity === Tenant) continue;
        await manager.delete(entity, { tenantId: id } as any);
      }
      await manager.delete(Tenant, id);
    });
    this.logger.log(
      `Deleted tenant record ${id} (${tenant.name}) and all scoped rows`,
    );

    return { message: `Tenant '${tenant.name}' has been permanently deleted` };
  }

  async resetAdminPassword(tenantId: string) {
    const tenant = await this.findById(tenantId);
    const tenantDs = await this.registry.getOrCreate(tenant.id, tenant.slug);

    const admin = await tenantDs.getRepository(User).findOne({
      where: { tenantId: tenant.id, role: Role.ADMIN, isActive: true },
      select: ['id', 'email', 'firstName', 'lastName'],
    });
    if (!admin)
      throw new NotFoundException('Admin user not found for this tenant');

    const newPassword = this.generateSecurePassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await tenantDs.getRepository(User).update(admin.id, { passwordHash });

    return {
      email: admin.email,
      adminName: `${admin.firstName} ${admin.lastName}`,
      temporaryPassword: newPassword,
      tenantId,
      tenantSlug: tenant.slug,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Converts a name to a URL-safe slug.
   * "Apollo Hospital" → "apollo-hospital"
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
  }

  /** First entry in PLATFORM_DOMAINS — same env var TenantContextMiddleware
   * uses for subdomain routing, so the default portal URL always points at
   * a domain that actually resolves to this platform. */
  private primaryPlatformDomain(): string {
    const first = (process.env.PLATFORM_DOMAINS ?? 'megnim.com')
      .split(',')[0]
      ?.trim()
      .toLowerCase();
    return first || 'megnim.com';
  }

  private generateSecurePassword(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '@#$!';
    let pwd =
      upper[Math.floor(Math.random() * upper.length)] +
      lower[Math.floor(Math.random() * lower.length)] +
      digits[Math.floor(Math.random() * digits.length)] +
      special[Math.floor(Math.random() * special.length)];
    const all = upper + lower + digits;
    for (let i = 0; i < 6; i++)
      pwd += all[Math.floor(Math.random() * all.length)];
    return pwd
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}

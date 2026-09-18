import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantsService } from './tenants.service';
import {
  Tenant,
  User,
  Role,
  TenantDataSourceRegistry,
} from '@mediflow/database';

// ── Generic repo mock factory ─────────────────────────────────────────────────

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest
      .fn()
      .mockImplementation(async (e) => ({ id: 'generated-id', ...e })),
    create: jest.fn().mockImplementation((dto) => ({ ...dto })),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('TenantsService', () => {
  let service: TenantsService;
  let tenantRepoMock: ReturnType<typeof makeRepo>;
  let userRepoMock: ReturnType<typeof makeRepo>;
  let platformDsMock: {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };
  let registryMock: { getOrCreate: jest.Mock; evict: jest.Mock };
  let tenantDsMock: { getRepository: jest.Mock };

  beforeEach(async () => {
    tenantRepoMock = makeRepo();
    userRepoMock = makeRepo();

    tenantDsMock = {
      getRepository: jest.fn().mockImplementation((Entity: any) => {
        if (Entity === User || Entity?.name === 'User') return userRepoMock;
        return makeRepo();
      }),
    };

    platformDsMock = {
      getRepository: jest.fn().mockImplementation((Entity: any) => {
        if (Entity === User || Entity?.name === 'User') return userRepoMock;
        return makeRepo();
      }),
      transaction: jest.fn(),
    };

    registryMock = {
      getOrCreate: jest.fn().mockResolvedValue(tenantDsMock),
      evict: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepoMock },
        { provide: getDataSourceToken(), useValue: platformDsMock },
        { provide: TenantDataSourceRegistry, useValue: registryMock },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  // ── create (onboarding) ────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      name: 'City General Hospital',
      adminEmail: 'admin@city.com',
      adminPassword: 'SuperSecret123',
      adminFirstName: 'Jane',
      adminLastName: 'Doe',
      adminPhone: '+919876543210',
    } as any;

    it('auto-generates a URL-safe slug from the hospital name when none is given', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null); // slug not taken

      const result = await service.create(baseDto);

      const savedArg = tenantRepoMock.create.mock.calls[0][0];
      expect(savedArg.slug).toBe('city-general-hospital');
      expect(result.tenant.slug).toBe('city-general-hospital');
    });

    it('lowercases an explicitly provided slug instead of generating one', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create({ ...baseDto, slug: 'CityGeneral' });

      expect(tenantRepoMock.create.mock.calls[0][0].slug).toBe('citygeneral');
    });

    it('throws ConflictException when the slug is already taken', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 'existing',
        slug: 'city-general-hospital',
      });

      await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
      expect(registryMock.getOrCreate).not.toHaveBeenCalled();
    });

    it('rejects an explicit slug that collides with a reserved platform subdomain', async () => {
      await expect(
        service.create({ ...baseDto, slug: 'app' }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantRepoMock.findOne).not.toHaveBeenCalled();
      expect(registryMock.getOrCreate).not.toHaveBeenCalled();
    });

    it('rejects an auto-generated slug that collides with a reserved platform subdomain', async () => {
      await expect(
        service.create({ ...baseDto, name: 'API', slug: undefined }),
      ).rejects.toThrow(BadRequestException);
      expect(registryMock.getOrCreate).not.toHaveBeenCalled();
    });

    it('defaults portalUrl to https://<slug>.<primary PLATFORM_DOMAINS entry> when not provided', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create(baseDto);

      expect(tenantRepoMock.create.mock.calls[0][0].portalUrl).toBe(
        'https://city-general-hospital.megnim.com',
      );
    });

    it('creates the admin user scoped to the new tenant, role ADMIN, with a bcrypt-hashed password', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);

      const result = await service.create(baseDto);

      expect(registryMock.getOrCreate).toHaveBeenCalledWith(
        'generated-id',
        'city-general-hospital',
      );

      const savedUser = userRepoMock.create.mock.calls[0][0];
      expect(savedUser.tenantId).toBe('generated-id');
      expect(savedUser.role).toBe(Role.ADMIN);
      expect(savedUser.email).toBe(baseDto.adminEmail);

      // password must be hashed, never stored/returned in plaintext internally
      expect(savedUser.passwordHash).not.toBe(baseDto.adminPassword);
      await expect(
        bcrypt.compare(baseDto.adminPassword, savedUser.passwordHash),
      ).resolves.toBe(true);

      // the plaintext password IS handed back once, for the onboarding handoff screen
      expect(result.credentials).toMatchObject({
        email: baseDto.adminEmail,
        password: baseDto.adminPassword,
        tenantId: 'generated-id',
        tenantSlug: 'city-general-hospital',
      });
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('throws NotFoundException when the tenant does not exist', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);
      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the tenant when found', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({ id: 't1', name: 'Acme' });
      await expect(service.findById('t1')).resolves.toEqual({
        id: 't1',
        name: 'Acme',
      });
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('patches only the tenant profile fields that were supplied', async () => {
      tenantRepoMock.findOne
        .mockResolvedValueOnce({ id: 't1', slug: 'acme', name: 'Old Name' })
        .mockResolvedValueOnce({ id: 't1', slug: 'acme', name: 'New Name' });

      await service.update('t1', { name: 'New Name' } as any);

      expect(tenantRepoMock.update).toHaveBeenCalledWith('t1', {
        name: 'New Name',
      });
      expect(userRepoMock.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when admin fields are supplied for the platform tenant (no slug)', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 'platform',
        slug: null,
      });

      await expect(
        service.update('platform', { adminEmail: 'new@x.com' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when no active ADMIN user exists for the tenant', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 't1',
        slug: 'acme',
      });
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update('t1', { adminEmail: 'new@x.com' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('hashes a new admin password before saving', async () => {
      tenantRepoMock.findOne
        .mockResolvedValueOnce({ id: 't1', slug: 'acme' })
        .mockResolvedValueOnce({ id: 't1', slug: 'acme' });
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'a@x.com',
      });

      await service.update('t1', { adminPassword: 'NewPass123' } as any);

      const patch = userRepoMock.update.mock.calls[0][1];
      expect(patch.passwordHash).toBeDefined();
      await expect(
        bcrypt.compare('NewPass123', patch.passwordHash),
      ).resolves.toBe(true);
    });
  });

  // ── deactivate ──────────────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets isActive false and evicts the cached DataSource', async () => {
      tenantRepoMock.findOne
        .mockResolvedValueOnce({ id: 't1', slug: 'acme' })
        .mockResolvedValueOnce({ id: 't1', slug: 'acme', isActive: false });

      await service.deactivate('t1');

      expect(tenantRepoMock.update).toHaveBeenCalledWith('t1', {
        isActive: false,
      });
      expect(registryMock.evict).toHaveBeenCalledWith('t1');
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('refuses to delete the platform tenant (no slug)', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 'platform',
        slug: null,
        name: 'Platform',
      });

      await expect(service.delete('platform')).rejects.toThrow(
        ForbiddenException,
      );
      expect(platformDsMock.transaction).not.toHaveBeenCalled();
    });

    it('evicts the tenant and deletes the tenant row last, inside one transaction', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 't1',
        slug: 'acme',
        name: 'Acme',
      });

      const managerDeleteCalls: any[] = [];
      platformDsMock.transaction.mockImplementationOnce(async (fn: any) => {
        const manager = {
          delete: jest.fn((...args) => managerDeleteCalls.push(args)),
        };
        return fn(manager);
      });

      const result = await service.delete('t1');

      expect(registryMock.evict).toHaveBeenCalledWith('t1');
      expect(managerDeleteCalls.length).toBeGreaterThan(0);
      // The tenant row itself must be the last thing deleted, so tenant-scoped
      // rows never get orphaned mid-transaction if something fails partway.
      const lastCall = managerDeleteCalls[managerDeleteCalls.length - 1];
      expect(lastCall[0]).toBe(Tenant);
      expect(lastCall[1]).toBe('t1');
      expect(result.message).toContain('Acme');
    });
  });

  // ── resetAdminPassword ────────────────────────────────────────────────────

  describe('resetAdminPassword', () => {
    it('throws NotFoundException when no active admin exists for the tenant', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 't1',
        slug: 'acme',
      });
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await expect(service.resetAdminPassword('t1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('generates a fresh random password and stores only its hash', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 't1',
        slug: 'acme',
      });
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@acme.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      const result = await service.resetAdminPassword('t1');

      expect(result.temporaryPassword).toHaveLength(10);
      const patch = userRepoMock.update.mock.calls[0][1];
      expect(patch.passwordHash).not.toBe(result.temporaryPassword);
      await expect(
        bcrypt.compare(result.temporaryPassword, patch.passwordHash),
      ).resolves.toBe(true);
    });

    it('generates a different password on each call', async () => {
      tenantRepoMock.findOne
        .mockResolvedValueOnce({ id: 't1', slug: 'acme' })
        .mockResolvedValueOnce({ id: 't1', slug: 'acme' });
      userRepoMock.findOne
        .mockResolvedValueOnce({ id: 'admin-1', email: 'admin@acme.com' })
        .mockResolvedValueOnce({ id: 'admin-1', email: 'admin@acme.com' });

      const first = await service.resetAdminPassword('t1');
      const second = await service.resetAdminPassword('t1');

      expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    });
  });
});

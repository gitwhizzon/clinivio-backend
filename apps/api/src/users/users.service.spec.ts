import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService, CreateUserDto } from './users.service';
import {
  User,
  DoctorProfile,
  StaffProfile,
  Role,
  TenantEntityManager,
} from '@mediflow/database';

// ── Generic repo + query-builder mock factories ───────────────────────────────

function makeQueryBuilder(overrides: Record<string, any> = {}) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    ...overrides,
  };
  return qb;
}

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest
      .fn()
      .mockImplementation(async (e) => ({ id: 'generated-id', ...e })),
    create: jest.fn().mockImplementation((dto) => ({ ...dto })),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockImplementation(() => makeQueryBuilder()),
    ...overrides,
  };
}

const TENANT_ID = 'tenant-1';

describe('UsersService', () => {
  let service: UsersService;
  let userRepoMock: ReturnType<typeof makeRepo>;
  let doctorProfileRepoMock: ReturnType<typeof makeRepo>;
  let staffProfileRepoMock: ReturnType<typeof makeRepo>;
  let dbMock: { repo: jest.Mock; qb: jest.Mock };

  beforeEach(async () => {
    userRepoMock = makeRepo();
    doctorProfileRepoMock = makeRepo();
    staffProfileRepoMock = makeRepo();

    // Default read-back: create() calls findById() at the end via
    // repo(User).findOne(...) — give it something non-null by default so
    // tests that don't care about the exact shape don't have to stub it.
    userRepoMock.findOne.mockResolvedValue({ id: 'generated-id' });

    dbMock = {
      repo: jest.fn().mockImplementation((Entity: any) => {
        if (Entity === User) return userRepoMock;
        if (Entity === DoctorProfile) return doctorProfileRepoMock;
        if (Entity === StaffProfile) return staffProfileRepoMock;
        return makeRepo();
      }),
      qb: jest.fn().mockImplementation(() => makeQueryBuilder()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantEntityManager, useValue: dbMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  const baseDto: CreateUserDto = {
    email: 'sam.doctor@acme.com',
    password: 'StaffPass123',
    firstName: 'Sam',
    lastName: 'Doctor',
    role: Role.DOCTOR,
  };

  // ── create — validation & password hashing ────────────────────────────────

  describe('create', () => {
    it('throws ConflictException when the email is already taken within the tenant', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({ id: 'existing-user' });

      await expect(service.create(TENANT_ID, baseDto)).rejects.toThrow(
        ConflictException,
      );
      expect(userRepoMock.save).not.toHaveBeenCalled();
    });

    it('hashes the password before saving — never stores it in plaintext', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null); // no existing user with this email

      await service.create(TENANT_ID, baseDto);

      const savedArg = userRepoMock.create.mock.calls[0][0];
      expect(savedArg.passwordHash).not.toBe(baseDto.password);
      await expect(
        bcrypt.compare(baseDto.password, savedArg.passwordHash),
      ).resolves.toBe(true);
    });

    it('scopes the new user to the given tenantId', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create(TENANT_ID, baseDto);

      expect(userRepoMock.create.mock.calls[0][0].tenantId).toBe(TENANT_ID);
    });
  });

  // ── create — staffId auto-generation ──────────────────────────────────────

  describe('create — staffId generation', () => {
    it('assigns the first sequential staffId (DOC0001) when no doctor exists yet for the tenant', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null); // no email conflict
      userRepoMock.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }),
      );

      await service.create(TENANT_ID, baseDto);

      expect(userRepoMock.create.mock.calls[0][0].staffId).toBe('DOC0001');
    });

    it('increments from the last staffId with the same role prefix', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);
      userRepoMock.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({
          getOne: jest.fn().mockResolvedValue({ staffId: 'DOC0007' }),
        }),
      );

      await service.create(TENANT_ID, baseDto);

      expect(userRepoMock.create.mock.calls[0][0].staffId).toBe('DOC0008');
    });

    it('uses a distinct prefix per role (NRS for nurses)', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);
      userRepoMock.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }),
      );

      await service.create(TENANT_ID, {
        ...baseDto,
        role: Role.NURSE,
      });

      expect(userRepoMock.create.mock.calls[0][0].staffId).toBe('NRS0001');
    });

    it('does not assign a staffId to a SUPER_ADMIN', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create(TENANT_ID, {
        ...baseDto,
        role: Role.SUPER_ADMIN,
      });

      expect(userRepoMock.create.mock.calls[0][0].staffId).toBeNull();
      expect(userRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── create — role-specific profile rows ───────────────────────────────────

  describe('create — role-specific profiles', () => {
    it('creates a DoctorProfile scoped to the tenant when role is DOCTOR', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create(TENANT_ID, {
        ...baseDto,
        specialty: 'Cardiology',
      });

      expect(doctorProfileRepoMock.save).toHaveBeenCalled();
      const profile = doctorProfileRepoMock.create.mock.calls[0][0];
      expect(profile.tenantId).toBe(TENANT_ID);
      expect(profile.specialty).toBe('Cardiology');
      expect(staffProfileRepoMock.save).not.toHaveBeenCalled();
    });

    it.each([
      Role.NURSE,
      Role.RECEPTIONIST,
      Role.LAB_TECHNICIAN,
      Role.PHARMACIST,
    ])(
      'creates a StaffProfile scoped to the tenant when role is %s',
      async (role) => {
        userRepoMock.findOne.mockResolvedValueOnce(null);

        await service.create(TENANT_ID, { ...baseDto, role });

        expect(staffProfileRepoMock.save).toHaveBeenCalled();
        expect(staffProfileRepoMock.create.mock.calls[0][0].tenantId).toBe(
          TENANT_ID,
        );
        expect(doctorProfileRepoMock.save).not.toHaveBeenCalled();
      },
    );

    it('creates neither profile type for ADMIN', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);

      await service.create(TENANT_ID, { ...baseDto, role: Role.ADMIN });

      expect(doctorProfileRepoMock.save).not.toHaveBeenCalled();
      expect(staffProfileRepoMock.save).not.toHaveBeenCalled();
    });
  });

  // ── assignStaffId ──────────────────────────────────────────────────────────

  describe('assignStaffId', () => {
    it('is a no-op when the user already has a staffId', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'u1',
        staffId: 'DOC0003',
        role: Role.DOCTOR,
      });

      const result = await service.assignStaffId('u1', TENANT_ID);

      expect(result.staffId).toBe('DOC0003');
      expect(userRepoMock.update).not.toHaveBeenCalled();
    });

    it("generates and persists a staffId when the user doesn't have one", async () => {
      userRepoMock.findOne
        .mockResolvedValueOnce({ id: 'u1', staffId: null, role: Role.NURSE }) // findById before generating
        .mockResolvedValueOnce({
          id: 'u1',
          staffId: 'NRS0001',
          role: Role.NURSE,
        }); // findById after update
      userRepoMock.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }),
      );

      const result = await service.assignStaffId('u1', TENANT_ID);

      expect(userRepoMock.update).toHaveBeenCalledWith('u1', {
        staffId: 'NRS0001',
      });
      expect(result.staffId).toBe('NRS0001');
    });
  });

  // ── update — authorization (regression coverage for a real privilege-
  //    escalation bug: any authenticated role could previously PATCH any
  //    other user in the tenant, including their password/isActive) ─────────

  describe('update — authorization', () => {
    const targetUser = {
      id: 'target-user',
      tenantId: TENANT_ID,
      email: 'target@acme.com',
      role: Role.ADMIN,
    };

    it('throws ForbiddenException when a non-admin tries to update someone else', async () => {
      userRepoMock.findOne.mockResolvedValueOnce(targetUser);

      await expect(
        service.update(
          'target-user',
          TENANT_ID,
          { firstName: 'Hacked' },
          { id: 'nurse-user', role: Role.NURSE },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(userRepoMock.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a user tries to change their own password via this endpoint", async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        ...targetUser,
        id: 'nurse-user',
        role: Role.NURSE,
      });

      await expect(
        service.update(
          'nurse-user',
          TENANT_ID,
          { password: 'NewPassword123' },
          { id: 'nurse-user', role: Role.NURSE },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(userRepoMock.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when a user tries to change their own isActive flag', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        ...targetUser,
        id: 'nurse-user',
        role: Role.NURSE,
      });

      await expect(
        service.update(
          'nurse-user',
          TENANT_ID,
          { isActive: false },
          { id: 'nurse-user', role: Role.NURSE },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a non-admin to update their own non-restricted profile fields', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        ...targetUser,
        id: 'nurse-user',
        role: Role.NURSE,
      });

      await service.update(
        'nurse-user',
        TENANT_ID,
        { firstName: 'NewName' },
        { id: 'nurse-user', role: Role.NURSE },
      );

      expect(userRepoMock.update).toHaveBeenCalledWith('nurse-user', {
        firstName: 'NewName',
      });
    });

    it("allows an ADMIN to update another user's password and isActive", async () => {
      userRepoMock.findOne.mockResolvedValueOnce(targetUser);

      // Real bcrypt.hash instead of jest.spyOn(bcrypt, 'hash') — spying on
      // bcrypt's export throws "Cannot redefine property: hash" on Linux CI
      // (its native binding isn't configurable there like it is on Windows),
      // and verifying the hash actually matches is a stronger assertion anyway.
      await service.update(
        'target-user',
        TENANT_ID,
        { password: 'ResetByAdmin123', isActive: false },
        { id: 'admin-user', role: Role.ADMIN },
      );

      expect(userRepoMock.update).toHaveBeenCalledTimes(1);
      const [id, patch] = userRepoMock.update.mock.calls[0];
      expect(id).toBe('target-user');
      expect(patch.isActive).toBe(false);
      await expect(
        bcrypt.compare('ResetByAdmin123', patch.passwordHash),
      ).resolves.toBe(true);
    });

    it("throws ForbiddenException when an admin tries to change their own password via this endpoint", async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        ...targetUser,
        id: 'admin-user',
      });

      await expect(
        service.update(
          'admin-user',
          TENANT_ID,
          { password: 'SelfReset123' },
          { id: 'admin-user', role: Role.ADMIN },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it("throws NotFoundException when the user doesn't exist in this tenant", async () => {
      userRepoMock.findOne.mockResolvedValueOnce(null);
      await expect(service.findById('missing', TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { EmailService } from '../email/email.service';
import { TenantDataSourceRegistry, User, Tenant } from '@mediflow/database';

const userRepoMock = {
  findOne: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const tenantRepoMock = {
  findOne: jest.fn(),
};

function createQueryBuilderMock(result: any) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  };
}

const platformDsMock = {
  getRepository: jest.fn().mockImplementation((EntityClass: any) => {
    if (EntityClass === User || EntityClass?.name === "User") {
      return userRepoMock;
    }
    if (EntityClass === Tenant || EntityClass?.name === "Tenant") {
      return tenantRepoMock;
    }
    return { findOne: jest.fn(), update: jest.fn() };
  }),
};

const registryMock = {
  currentOrNull: null as any,
  getOrCreate: jest.fn(),
};

const jwtServiceMock = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
  verify: jest.fn(),
};

const configServiceMock = {
  get: jest.fn().mockReturnValue('mock-secret'),
};

const emailServiceMock = {
  sendMail: jest.fn().mockResolvedValue(undefined),
  buildPasswordResetEmail: jest
    .fn()
    .mockReturnValue({ html: '<p>reset</p>', text: 'reset' }),
};

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    registryMock.currentOrNull = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getDataSourceToken(), useValue: platformDsMock },
        { provide: TenantDataSourceRegistry, useValue: registryMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe("validateUser - SUPER_ADMIN path", () => {
    it("returns null when user does not exist", async () => {
      userRepoMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock(null),
      );

      const result = await service.validateUser("nobody@test.com", "pass");

      expect(result).toBeNull();
    });

    it("returns null when password is wrong", async () => {
      const hash = await bcrypt.hash("correct", 10);
      userRepoMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          id: "u1",
          email: "admin@test.com",
          passwordHash: hash,
          role: "SUPER_ADMIN",
        }),
      );

      const result = await service.validateUser("admin@test.com", "wrong");

      expect(result).toBeNull();
    });

    it("returns user without passwordHash on valid credentials", async () => {
      const hash = await bcrypt.hash("secret", 10);
      userRepoMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          id: "u1",
          email: "admin@test.com",
          passwordHash: hash,
          role: "SUPER_ADMIN",
          firstName: "Admin",
        }),
      );
      userRepoMock.update.mockResolvedValueOnce({});

      const result = await service.validateUser('admin@test.com', 'secret');

      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('admin@test.com');
    });
  });

  describe("validateUser - tenant path", () => {
    it("bootstraps tenant DataSource and validates against tenant users", async () => {
      const tenantUserRepoMock = {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
      };
      const tenantDsMock = {
        getRepository: jest.fn().mockReturnValue(tenantUserRepoMock),
      };

      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: 'tenant-1',
        slug: 'acme',
        isActive: true,
      });
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDsMock);

      const hash = await bcrypt.hash("pw", 10);
      tenantUserRepoMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          id: "u2",
          email: "staff@acme.com",
          passwordHash: hash,
          tenantId: "tenant-1",
        }),
      );
      tenantUserRepoMock.update.mockResolvedValueOnce({});

      const result = await service.validateUser(
        'staff@acme.com',
        'pw',
        'tenant-1',
      );

      expect(registryMock.getOrCreate).toHaveBeenCalledWith('tenant-1', 'acme');
      expect(result).not.toBeNull();
      expect(result.email).toBe('staff@acme.com');
    });

    it("matches tenant staffId case-insensitively", async () => {
      const tenantUserRepoMock = {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
      };
      const tenantDsMock = {
        getRepository: jest.fn().mockReturnValue(tenantUserRepoMock),
      };

      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: "tenant-1",
        slug: "acme",
        isActive: true,
      });
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDsMock);

      const hash = await bcrypt.hash("pw", 10);
      const qbMock = createQueryBuilderMock({
        id: "u2",
        email: "staff@acme.com",
        staffId: "RCP0001",
        passwordHash: hash,
        tenantId: "tenant-1",
      });
      tenantUserRepoMock.createQueryBuilder.mockReturnValue(qbMock);
      tenantUserRepoMock.update.mockResolvedValueOnce({});

      const result = await service.validateUser("rcp0001", "pw", "tenant-1");

      expect(tenantUserRepoMock.createQueryBuilder).toHaveBeenCalledWith(
        "user",
      );
      expect(qbMock.andWhere).toHaveBeenCalledWith(
        "(LOWER(COALESCE(user.staffId, '')) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier))",
        { identifier: "rcp0001" },
      );
      expect(result).not.toBeNull();
      expect(result.staffId).toBe("RCP0001");
    });

    it("returns null when tenant is not found", async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);

      const result = await service.validateUser(
        'staff@acme.com',
        'pw',
        'missing-tenant',
      );

      expect(result).toBeNull();
    });

    it("returns null when tenant user is not found", async () => {
      const tenantUserRepoMock = {
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createQueryBuilderMock(null)),
        update: jest.fn(),
      };
      const tenantDsMock = {
        getRepository: jest.fn().mockReturnValue(tenantUserRepoMock),
      };

      tenantRepoMock.findOne.mockResolvedValueOnce({
        id: "tenant-1",
        slug: "acme",
        isActive: true,
      });
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDsMock);

      const result = await service.validateUser(
        "missing@acme.com",
        "pw",
        "tenant-1",
      );

      expect(result).toBeNull();
    });
  });

  describe("login", () => {
    it("returns accessToken, refreshToken, and sanitised user shape", async () => {
      const result = await service.login({
        id: 'u1',
        email: 'a@b.com',
        firstName: 'Alice',
        lastName: 'Smith',
        role: 'ADMIN',
        tenantId: 't1',
        doctorProfile: null,
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-access-token');
      expect(result.user.email).toBe('a@b.com');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('signs access and refresh tokens with correct payloads', async () => {
      await service.login({
        id: 'u1',
        email: 'x@y.com',
        role: 'DOCTOR',
        tenantId: 't2',
        firstName: 'X',
        lastName: 'Y',
        doctorProfile: null,
      });

      expect(jwtServiceMock.sign).toHaveBeenCalledTimes(2);
      const [accessPayload] = jwtServiceMock.sign.mock.calls[0];
      expect(accessPayload).toMatchObject({
        sub: 'u1',
        role: 'DOCTOR',
        tenantId: 't2',
      });
    });
  });

  describe("refreshToken", () => {
    it("throws UnauthorizedException on invalid or expired token", async () => {
      jwtServiceMock.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshToken("expired-token")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns new accessToken when refresh token is valid', async () => {
      jwtServiceMock.verify.mockReturnValueOnce({
        sub: 'u1',
        tenantId: 't1',
        role: 'ADMIN',
        email: 'a@b.com',
      });

      const result = await service.refreshToken('valid-refresh');
      expect(result.accessToken).toBe('mock-access-token');
    });
  });

  describe("logout", () => {
    it("returns success message", async () => {
      const result = await service.logout("u1");
      expect(result.message).toBe("Logged out successfully");
    });
  });
});

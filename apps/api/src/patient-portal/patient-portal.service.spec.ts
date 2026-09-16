import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  PatientPortalService,
  OTP_REDIS_CLIENT,
} from './patient-portal.service';
import { RazorpayService } from '../payments/razorpay.service';
import { InvoicesService } from '../invoices/invoices.service';
import { TenantDataSourceRegistry, Tenant } from '@mediflow/database';

// ── Generic repo mock factory ─────────────────────────────────────────────────

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn().mockImplementation(async (e) => e),
    create: jest.fn().mockImplementation((dto) => ({ ...dto })),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    increment: jest.fn(),
    ...overrides,
  };
}

// ── Tenant / DS factories ─────────────────────────────────────────────────────

const MOCK_TENANT: Partial<Tenant> = {
  id: 'tenant-1',
  slug: 'acme',
  isActive: true,
} as any;

function makeTenantDs(
  repos: Partial<Record<string, ReturnType<typeof makeRepo>>> = {},
) {
  const defaults: Record<string, ReturnType<typeof makeRepo>> = {
    PatientAccount: makeRepo(),
    Patient: makeRepo(),
    Appointment: makeRepo(),
    DoctorSlot: makeRepo(),
    DoctorProfile: makeRepo(),
    Department: makeRepo(),
  };
  const merged = { ...defaults, ...repos };

  return {
    getRepository: jest.fn().mockImplementation((EntityClass: any) => {
      const name: string =
        typeof EntityClass === 'function'
          ? EntityClass.name
          : String(EntityClass);
      return merged[name] ?? makeRepo();
    }),
    _repos: merged,
  };
}

const tenantRepoMock = {
  findOne: jest.fn(),
};

const platformDsMock = {
  getRepository: jest.fn().mockImplementation((EntityClass: any) => {
    if (EntityClass === Tenant || EntityClass?.name === 'Tenant')
      return tenantRepoMock;
    return makeRepo();
  }),
};

const registryMock = {
  currentOrNull: null as any,
  getOrCreate: jest.fn(),
};

const jwtServiceMock = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

const configServiceMock = {
  get: jest.fn().mockReturnValue('mock-secret'),
};

const razorpayServiceMock = {
  createOrder: jest.fn(),
  verifyPaymentSignature: jest.fn(),
};

const invoicesServiceMock = {
  create: jest.fn(),
  findOne: jest.fn(),
};

const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PatientPortalService', () => {
  let service: PatientPortalService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: getDataSourceToken(), useValue: platformDsMock },
        { provide: TenantDataSourceRegistry, useValue: registryMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RazorpayService, useValue: razorpayServiceMock },
        { provide: InvoicesService, useValue: invoicesServiceMock },
        { provide: OTP_REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get<PatientPortalService>(PatientPortalService);
  });

  // ── register ──────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new patient and account, returns accessToken', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      // No existing account
      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce(null);
      tenantDs._repos.Patient.count.mockResolvedValueOnce(5);
      tenantDs._repos.Patient.save.mockResolvedValueOnce({
        id: 'patient-1',
        uhid: 'UHID-000006',
        firstName: 'John',
        lastName: 'Doe',
        phone: '9999999999',
        email: null,
        tenantId: 'tenant-1',
      });
      tenantDs._repos.PatientAccount.save.mockResolvedValueOnce({
        id: 'acc-1',
        patientId: 'patient-1',
        tenantId: 'tenant-1',
        phone: '9999999999',
      });

      const result = await service.register({
        slug: 'acme',
        phone: '9999999999',
        password: 'pass123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.patient.uhid).toBe('UHID-000006');
    });

    it('throws ConflictException when phone already registered', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce({
        id: 'existing-acc',
      });

      await expect(
        service.register({
          slug: 'acme',
          phone: '9999999999',
          password: 'pass',
          firstName: 'J',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when tenant slug is invalid', async () => {
      tenantRepoMock.findOne.mockResolvedValueOnce(null);

      await expect(
        service.register({
          slug: 'unknown',
          phone: '9999999999',
          password: 'pass',
          firstName: 'J',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('links to existing patient when UHID provided and phone matches', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce(null);
      tenantDs._repos.Patient.findOne.mockResolvedValueOnce({
        id: 'existing-patient',
        uhid: 'UHID-000001',
        firstName: 'Jane',
        phone: '8888888888',
        isActive: true,
      });
      tenantDs._repos.PatientAccount.save.mockResolvedValueOnce({
        id: 'acc-2',
        patientId: 'existing-patient',
        tenantId: 'tenant-1',
        phone: '8888888888',
      });

      const result = await service.register({
        slug: 'acme',
        uhid: 'UHID-000001',
        phone: '8888888888',
        password: 'pass',
        firstName: 'Jane',
      });

      expect(result.patient.uhid).toBe('UHID-000001');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns accessToken and patient on valid credentials', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      const passwordHash = await bcrypt.hash('mypass', 10);
      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        phone: '9999999999',
        passwordHash,
        isActive: true,
        patientId: 'p1',
        tenantId: 'tenant-1',
        patient: {
          id: 'p1',
          uhid: 'UHID-000001',
          firstName: 'John',
          lastName: null,
          phone: '9999999999',
          email: null,
        },
      });
      tenantDs._repos.PatientAccount.update.mockResolvedValueOnce({});

      const result = await service.login({
        slug: 'acme',
        phone: '9999999999',
        password: 'mypass',
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.patient.phone).toBe('9999999999');
    });

    it('throws UnauthorizedException when account not found', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce(null);

      await expect(
        service.login({ slug: 'acme', phone: '0000000000', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      const passwordHash = await bcrypt.hash('correct', 10);
      tenantDs._repos.PatientAccount.findOne.mockResolvedValueOnce({
        id: 'acc-1',
        phone: '9999999999',
        passwordHash,
        isActive: true,
        patient: { id: 'p1', uhid: 'UHID-000001', firstName: 'John' },
      });

      await expect(
        service.login({ slug: 'acme', phone: '9999999999', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── bookAppointment ───────────────────────────────────────────────────────────

  describe('bookAppointment', () => {
    const TENANT_ID = 'tenant-1';
    const PATIENT_ID = 'patient-1';

    it('creates appointment and increments slot bookedCount', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.DoctorSlot.findOne.mockResolvedValueOnce({
        id: 'slot-1',
        isBlocked: false,
        bookedCount: 2,
        maxPatients: 10,
      });
      tenantDs._repos.Appointment.count.mockResolvedValueOnce(99);

      const result = await service.bookAppointment(PATIENT_ID, TENANT_ID, {
        doctorId: 'doc-1',
        slotId: 'slot-1',
        chiefComplaint: 'Fever',
      });

      expect(result).toBeDefined();
      expect(tenantDs._repos.DoctorSlot.increment).toHaveBeenCalledWith(
        { id: 'slot-1', tenantId: TENANT_ID },
        'bookedCount',
        1,
      );
      expect(tenantDs._repos.Appointment.save).toHaveBeenCalled();
    });

    it('throws BadRequestException when slot is fully booked', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.DoctorSlot.findOne.mockResolvedValueOnce({
        id: 'slot-1',
        isBlocked: false,
        bookedCount: 10,
        maxPatients: 10,
      });

      await expect(
        service.bookAppointment(PATIENT_ID, TENANT_ID, {
          doctorId: 'doc-1',
          slotId: 'slot-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when slot is blocked', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.DoctorSlot.findOne.mockResolvedValueOnce(null);

      await expect(
        service.bookAppointment(PATIENT_ID, TENANT_ID, {
          doctorId: 'doc-1',
          slotId: 'slot-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancelAppointment ─────────────────────────────────────────────────────────

  describe('cancelAppointment', () => {
    it('cancels a confirmed appointment', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.Appointment.findOne.mockResolvedValueOnce({
        id: 'appt-1',
        patientId: 'patient-1',
        status: 'CONFIRMED',
      });

      const result = await service.cancelAppointment(
        'appt-1',
        'patient-1',
        'tenant-1',
      );
      expect(result.message).toBe('Appointment cancelled');
      expect(tenantDs._repos.Appointment.update).toHaveBeenCalledWith(
        'appt-1',
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });

    it('throws BadRequestException when appointment is already COMPLETED', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.Appointment.findOne.mockResolvedValueOnce({
        id: 'appt-2',
        patientId: 'patient-1',
        status: 'COMPLETED',
      });

      await expect(
        service.cancelAppointment('appt-2', 'patient-1', 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when appointment not found for this patient', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      tenantDs._repos.Appointment.findOne.mockResolvedValueOnce(null);

      await expect(
        service.cancelAppointment('ghost', 'patient-1', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getDoctors / getAvailableSlots ────────────────────────────────────────────

  describe('getDoctors', () => {
    it('queries isAcceptingPatients: true and returns results', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      const mockDoctors = [{ id: 'd1', isAcceptingPatients: true }];
      tenantDs._repos.DoctorProfile.find.mockResolvedValueOnce(mockDoctors);

      const result = await service.getDoctors('tenant-1');

      expect(tenantDs._repos.DoctorProfile.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', isAcceptingPatients: true },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getAvailableSlots', () => {
    it('queries slotDate, isBlocked: false and returns slots', async () => {
      const tenantDs = makeTenantDs();
      tenantRepoMock.findOne.mockResolvedValueOnce(MOCK_TENANT);
      registryMock.getOrCreate.mockResolvedValueOnce(tenantDs);

      const mockSlots = [
        { id: 's1', slotDate: '2026-06-20', isBlocked: false },
      ];
      tenantDs._repos.DoctorSlot.find.mockResolvedValueOnce(mockSlots);

      const result = await service.getAvailableSlots(
        'tenant-1',
        'doc-1',
        '2026-06-20',
      );

      expect(tenantDs._repos.DoctorSlot.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            doctorId: 'doc-1',
            slotDate: '2026-06-20',
            isBlocked: false,
          },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});

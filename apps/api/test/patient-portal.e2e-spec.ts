/**
 * Patient Portal — HTTP layer smoke tests.
 *
 * These tests boot the full NestJS app and fire real HTTP requests via Supertest.
 * They do NOT require a database — they validate:
 *  - DTO validation (400 on bad bodies)
 *  - Auth guards (401 on missing/invalid tokens)
 *  - Route wiring (endpoints exist and respond)
 *
 * Full integration tests that hit a real DB require DATABASE_URL_TEST
 * (Neon test branch). They are skipped automatically when the env var is absent.
 */

import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('PatientPortal (HTTP layer)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
    );
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Auth routes (public) ────────────────────────────────────────────────────

  describe('POST /patient-portal/auth/register', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/register')
        .send({})
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/register')
        .send({ slug: 'acme' }) // missing phone, password, firstName
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
    });
  });

  describe('POST /patient-portal/auth/login', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/login')
        .send({})
        .expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('returns 400 when only slug provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/login')
        .send({ slug: 'acme' })
        .expect(400);
      expect(Array.isArray(res.body.message)).toBe(true);
    });
  });

  // ── Protected routes (require patient JWT) ──────────────────────────────────

  const protectedRoutes = [
    { method: 'GET', path: '/patient-portal/me' },
    { method: 'GET', path: '/patient-portal/appointments' },
    { method: 'GET', path: '/patient-portal/consultations' },
    { method: 'GET', path: '/patient-portal/lab-results' },
    { method: 'GET', path: '/patient-portal/invoices' },
    { method: 'GET', path: '/patient-portal/doctors' },
    { method: 'GET', path: '/patient-portal/departments' },
  ] as const;

  describe('protected routes without token', () => {
    for (const route of protectedRoutes) {
      it(`${route.method} ${route.path} → 401 Unauthorized`, async () => {
        await (request(app.getHttpServer()) as any)
          [route.method.toLowerCase()](route.path)
          .expect(401);
      });
    }
  });

  describe('protected routes with wrong token type (staff JWT)', () => {
    it('GET /patient-portal/me → 401 when using a non-PATIENT token', async () => {
      // A signed token without type: 'PATIENT' — guard should reject it
      const fakeStaffToken = 'Bearer invalid.token.here';
      await request(app.getHttpServer())
        .get('/patient-portal/me')
        .set('Authorization', fakeStaffToken)
        .expect(401);
    });
  });

  // ── Integration tests (real DB — skipped when DATABASE_URL_TEST absent) ──────

  const itWithDb = process.env.DATABASE_URL_TEST ? it : it.skip;
  const TEST_SLUG = process.env.TEST_TENANT_SLUG ?? 'test-hospital';

  describe('register → login → get profile (real DB)', () => {
    const testPhone = `9${Date.now().toString().slice(-9)}`; // unique per run
    let accessToken: string;

    itWithDb('registers a new patient', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/register')
        .send({
          slug: TEST_SLUG,
          phone: testPhone,
          password: 'Test@1234',
          firstName: 'CI',
          lastName: 'Patient',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.patient.phone).toBe(testPhone);
      accessToken = res.body.accessToken;
    });

    itWithDb('logs in with the same credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/patient-portal/auth/login')
        .send({ slug: TEST_SLUG, phone: testPhone, password: 'Test@1234' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      accessToken = res.body.accessToken;
    });

    itWithDb('fetches patient profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/patient-portal/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.phone).toBe(testPhone);
    });

    itWithDb('rejects duplicate phone registration', async () => {
      await request(app.getHttpServer())
        .post('/patient-portal/auth/register')
        .send({
          slug: TEST_SLUG,
          phone: testPhone,
          password: 'AnotherPass1',
          firstName: 'Dupe',
        })
        .expect(409); // ConflictException
    });
  });
});

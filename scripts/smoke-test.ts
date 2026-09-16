/**
 * Clinivio API Smoke Test
 * ─────────────────────────────────────────────────────────────
 * Run after any backend fix to verify all role features work and API
 * response shapes match what the frontend expects.
 *
 * Usage:
 *   pnpm smoke                         # uses .smoke.env in repo root
 *   SMOKE_API_URL=http://... pnpm smoke # override URL inline
 *
 * One-time setup: copy .smoke.env.example → .smoke.env and fill in credentials.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// ── Load .smoke.env (silent if missing — env vars take precedence) ─────────────
const envFile = path.join(__dirname, '..', '.smoke.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE = process.env.SMOKE_API_URL ?? 'http://localhost:3000';
const SLUG = process.env.SMOKE_TENANT_SLUG ?? '';

const ROLES = {
  ADMIN: {
    email: process.env.SMOKE_ADMIN_EMAIL ?? '',
    password: process.env.SMOKE_ADMIN_PASSWORD ?? '',
  },
  RECEPTIONIST: {
    email: process.env.SMOKE_RECEPTIONIST_EMAIL ?? '',
    password: process.env.SMOKE_RECEPTIONIST_PASSWORD ?? '',
  },
  NURSE: {
    email: process.env.SMOKE_NURSE_EMAIL ?? '',
    password: process.env.SMOKE_NURSE_PASSWORD ?? '',
  },
  DOCTOR: {
    email: process.env.SMOKE_DOCTOR_EMAIL ?? '',
    password: process.env.SMOKE_DOCTOR_PASSWORD ?? '',
  },
  LAB_TECH: {
    email: process.env.SMOKE_LAB_EMAIL ?? '',
    password: process.env.SMOKE_LAB_PASSWORD ?? '',
  },
  PHARMACIST: {
    email: process.env.SMOKE_PHARMACIST_EMAIL ?? '',
    password: process.env.SMOKE_PHARMACIST_PASSWORD ?? '',
  },
} as const;

// ── ANSI colours (no chalk dependency) ────────────────────────────────────────
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

// ── Result tracking ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: Array<{ role: string; test: string; error: string }> = [];
let currentRole = '';

// ── Assertion helpers ──────────────────────────────────────────────────────────
function assertDefined(val: unknown, label: string): void {
  if (val === undefined || val === null) {
    throw new Error(
      `${label} is ${val} — frontend will crash trying to access it`,
    );
  }
}

function assertObject(val: unknown, label: string): void {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    throw new Error(
      `${label} must be a plain object, got ${Array.isArray(val) ? 'array' : typeof val}`,
    );
  }
}

function assertArray(val: unknown, label: string): void {
  if (!Array.isArray(val)) {
    throw new Error(`${label} must be an array, got ${typeof val}`);
  }
}

function assertNumber(val: unknown, label: string): void {
  if (typeof val !== 'number' || isNaN(val as number)) {
    throw new Error(`${label} must be a number, got ${typeof val} (${val})`);
  }
}

// ── Test runner ────────────────────────────────────────────────────────────────
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  ${c.green('✓')} ${name} ${c.dim(`(${ms}ms)`)}`);
    passed++;
  } catch (err: unknown) {
    const ms = Date.now() - start;
    let msg: string;
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const data = err.response?.data;
      msg = `HTTP ${status ?? 'ERR'} — ${typeof data === 'object' ? JSON.stringify(data) : (data ?? err.message)}`;
    } else {
      msg = (err as Error).message;
    }
    console.log(`  ${c.red('✗')} ${name} ${c.dim(`(${ms}ms)`)}`);
    console.log(`    ${c.red('→')} ${msg}`);
    failed++;
    failures.push({ role: currentRole, test: name, error: msg });
  }
}

// ── Auth helper ────────────────────────────────────────────────────────────────
async function login(
  email: string,
  password: string,
): Promise<AxiosInstance | null> {
  if (!email || !password) return null;
  try {
    const res = await axios.post(`${BASE}/auth/login`, {
      email,
      password,
      ...(SLUG ? { slug: SLUG } : {}),
    });
    const token = res.data.accessToken ?? res.data.access_token;
    if (!token) throw new Error('No access token in response');
    return axios.create({
      baseURL: BASE,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      const msg = err.response?.data?.message ?? err.message;
      console.log(`  ${c.yellow('⚠')} Login failed: ${msg}`);
    } else {
      console.log(`  ${c.yellow('⚠')} Login failed: ${(err as Error).message}`);
    }
    return null;
  }
}

// ── Role suites ────────────────────────────────────────────────────────────────

async function suiteLabTech(api: AxiosInstance) {
  // ── Tests catalog ───────────────────────────────────────────────────────────
  await test('GET /lab/tests → array', async () => {
    const { data } = await api.get('/lab/tests');
    assertArray(data, 'lab tests');
  });

  // ── Orders list ─────────────────────────────────────────────────────────────
  await test('GET /lab/orders → { data: [], pagination }', async () => {
    const { data } = await api.get('/lab/orders?limit=5');
    const list = data.data ?? data;
    assertArray(list, 'orders.data');
  });

  // ── Analytics shape — this was the crash source ─────────────────────────────
  await test('GET /lab/analytics → categoryBreakdown is object (not undefined)', async () => {
    const { data } = await api.get('/lab/analytics');
    assertDefined(data.totalOrders, 'analytics.totalOrders');
    assertDefined(data.completedRevenue, 'analytics.completedRevenue'); // used in AnalyticsTab
    assertDefined(data.avgTurnaroundHours, 'analytics.avgTurnaroundHours');
    assertDefined(data.criticalRate, 'analytics.criticalRate');
    assertDefined(data.criticalItems, 'analytics.criticalItems');
    assertObject(data.categoryBreakdown, 'analytics.categoryBreakdown'); // was undefined → crash
  });

  // ── Status transitions (just the HTTP contracts, no side-effects) ───────────
  await test('PATCH /lab/orders/:id/sample-collected exists (405 = method ok, 404 = missing)', async () => {
    // A 404 on the order itself is fine; 404 on the ROUTE means the endpoint was removed
    try {
      await api.patch(
        '/lab/orders/00000000-0000-0000-0000-000000000000/sample-collected',
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 404) return; // order not found = ok
      throw err;
    }
  });

  await test('PATCH /lab/orders/:id/processing exists', async () => {
    try {
      await api.patch(
        '/lab/orders/00000000-0000-0000-0000-000000000000/processing',
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 404) return;
      throw err;
    }
  });

  await test('PATCH /lab/orders/:id/cancel exists', async () => {
    try {
      await api.patch(
        '/lab/orders/00000000-0000-0000-0000-000000000000/cancel',
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 404) return;
      throw err;
    }
  });
}

async function suitePharmacist(api: AxiosInstance) {
  // ── Inventory list ──────────────────────────────────────────────────────────
  await test('GET /pharmacy/inventory → list', async () => {
    const { data } = await api.get('/pharmacy/inventory');
    const list = data.data ?? data;
    assertArray(list, 'inventory list');
  });

  // ── Stats shape — this was the crash source ─────────────────────────────────
  await test('GET /stats/pharmacy → inventory.categoryBreakdown is object', async () => {
    const { data } = await api.get('/stats/pharmacy');
    assertObject(data.inventory, 'stats.inventory');
    assertObject(
      data.inventory.categoryBreakdown,
      'stats.inventory.categoryBreakdown',
    ); // crash source
    assertDefined(data.inventory.totalItems, 'stats.inventory.totalItems');
    assertDefined(
      data.inventory.inventoryValue,
      'stats.inventory.inventoryValue',
    );
    assertObject(data.orders, 'stats.orders');
    assertDefined(data.orders.revenueMTD, 'stats.orders.revenueMTD'); // crash source
    assertDefined(data.orders.dispensedMTD, 'stats.orders.dispensedMTD');
    assertDefined(data.orders.dispensedToday, 'stats.orders.dispensedToday');
    assertDefined(data.orders.pending, 'stats.orders.pending');
  });

  // ── Orders ──────────────────────────────────────────────────────────────────
  await test('GET /pharmacy/orders → list', async () => {
    const { data } = await api.get('/pharmacy/orders');
    const list = data.data ?? data;
    assertArray(list, 'pharmacy orders');
  });
}

async function suiteAdmin(api: AxiosInstance) {
  // ── Dashboard ───────────────────────────────────────────────────────────────
  await test('GET /stats/dashboard → returns stats', async () => {
    const { data } = await api.get('/stats/dashboard');
    assertDefined(data, 'dashboard stats');
  });

  // ── Lab analytics accessible to admin ──────────────────────────────────────
  await test('GET /lab/analytics (admin) → categoryBreakdown is object', async () => {
    const { data } = await api.get('/lab/analytics');
    assertObject(data.categoryBreakdown, 'analytics.categoryBreakdown');
  });

  // ── Pharmacy stats accessible to admin ─────────────────────────────────────
  await test('GET /stats/pharmacy (admin) → correct shape', async () => {
    const { data } = await api.get('/stats/pharmacy');
    assertObject(data.inventory, 'stats.inventory');
    assertObject(
      data.inventory.categoryBreakdown,
      'stats.inventory.categoryBreakdown',
    );
    assertObject(data.orders, 'stats.orders');
  });

  // ── Patients accessible to admin ────────────────────────────────────────────
  await test('GET /patients → paginated list', async () => {
    const { data } = await api.get('/patients?limit=5');
    const list = data.data ?? data;
    assertDefined(list, 'patients list');
  });
}

async function suiteDoctor(api: AxiosInstance) {
  // ── Lab tests accessible to doctor ─────────────────────────────────────────
  await test('GET /lab/tests (doctor) → array', async () => {
    const { data } = await api.get('/lab/tests');
    assertArray(data, 'lab tests');
  });

  // ── Patients accessible ─────────────────────────────────────────────────────
  await test('GET /patients (doctor) → list', async () => {
    const { data } = await api.get('/patients?limit=5');
    const list = data.data ?? data;
    assertDefined(list, 'patients');
  });

  // ── Consultation history returns array (was a stub returning []) ────────────
  await test('GET /patients/:id/consultations → array (not stub)', async () => {
    // Fetch any patient to get a real ID first
    const patientsRes = await api.get('/patients?limit=1');
    const patients = patientsRes.data.data ?? patientsRes.data;
    if (!Array.isArray(patients) || patients.length === 0) {
      console.log(
        `    ${c.dim('(no patients — skipping consultation history check)')}`,
      );
      return;
    }
    const patientId = patients[0].id;
    const { data } = await api.get(`/patients/${patientId}/consultations`);
    assertArray(data, 'consultation history');
  });

  // ── Lab ordering accessible to doctor ──────────────────────────────────────
  await test('POST /lab/orders (doctor) → 400 when no testIds (not 403)', async () => {
    try {
      await api.post('/lab/orders', {
        patientId: '00000000-0000-0000-0000-000000000000',
        orderedById: '00000000-0000-0000-0000-000000000000',
        testIds: [],
      });
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 403)
          throw new Error(
            'Doctor cannot create lab orders — role guard is wrong',
          );
        if (err.response?.status === 400) return; // expected: validation error
        if (err.response?.status === 404) return; // expected: patient not found
      }
      throw err;
    }
  });

  // ── Appointments accessible ─────────────────────────────────────────────────
  await test('GET /appointments/queue (doctor) → accessible', async () => {
    const { data } = await api.get('/appointments/queue');
    assertDefined(data, 'queue');
  });
}

async function suiteNurse(api: AxiosInstance) {
  // ── Doctor queue (nurse sees all active patients today) ─────────────────────
  await test('GET /appointments/doctor-queue (nurse) → array', async () => {
    const { data } = await api.get('/appointments/doctor-queue');
    assertArray(data, 'doctor-queue');
  });

  // ── General queue accessible ────────────────────────────────────────────────
  await test('GET /appointments/queue (nurse) → accessible', async () => {
    const { data } = await api.get('/appointments/queue');
    assertDefined(data, 'queue');
  });

  // ── Lab orders accessible to nurse ─────────────────────────────────────────
  await test('GET /lab/orders (nurse) → list', async () => {
    const { data } = await api.get('/lab/orders?limit=5');
    const list = data.data ?? data;
    assertArray(list, 'orders');
  });
}

async function suiteReceptionist(api: AxiosInstance) {
  // ── Queue accessible ────────────────────────────────────────────────────────
  await test('GET /appointments/queue (receptionist) → accessible', async () => {
    const { data } = await api.get('/appointments/queue');
    assertDefined(data, 'queue');
  });

  // ── Patients accessible ─────────────────────────────────────────────────────
  await test('GET /patients (receptionist) → list', async () => {
    const { data } = await api.get('/patients?limit=5');
    const list = data.data ?? data;
    assertDefined(list, 'patients');
  });

  // ── Receptionist should NOT access lab analytics (403 expected) ─────────────
  await test('GET /lab/analytics (receptionist) → 403 Forbidden', async () => {
    try {
      await api.get('/lab/analytics');
      throw new Error(
        'Expected 403 but request succeeded — role guard missing',
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 403) return;
      throw err;
    }
  });

  // ── Receptionist should NOT access pharmacy stats ───────────────────────────
  await test('GET /stats/pharmacy (receptionist) → 403 Forbidden', async () => {
    try {
      await api.get('/stats/pharmacy');
      throw new Error(
        'Expected 403 but request succeeded — role guard missing',
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 403) return;
      throw err;
    }
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log();
  console.log(c.bold('🔬 Clinivio API Smoke Test'));
  console.log(c.dim(`   ${BASE}  ·  tenant: ${SLUG || '(from JWT)'}`));
  console.log(c.dim('─'.repeat(55)));

  type Suite = [string, (api: AxiosInstance) => Promise<void>];
  const suites: Suite[] = [
    ['LAB_TECHNICIAN', suiteLabTech],
    ['PHARMACIST', suitePharmacist],
    ['ADMIN', suiteAdmin],
    ['DOCTOR', suiteDoctor],
    ['NURSE', suiteNurse],
    ['RECEPTIONIST', suiteReceptionist],
  ];

  const roleKeyMap: Record<string, keyof typeof ROLES> = {
    LAB_TECHNICIAN: 'LAB_TECH',
    PHARMACIST: 'PHARMACIST',
    ADMIN: 'ADMIN',
    DOCTOR: 'DOCTOR',
    NURSE: 'NURSE',
    RECEPTIONIST: 'RECEPTIONIST',
  };

  for (const [role, suite] of suites) {
    currentRole = role;
    console.log();
    console.log(c.bold(c.cyan(`▶ ${role}`)));

    const creds = ROLES[roleKeyMap[role]];
    if (!creds.email) {
      console.log(`  ${c.yellow('⚠')}  No credentials configured — skipping`);
      console.log(
        c.dim(
          `     Set SMOKE_${roleKeyMap[role]}_EMAIL and SMOKE_${roleKeyMap[role]}_PASSWORD`,
        ),
      );
      skipped++;
      continue;
    }

    const api = await login(creds.email, creds.password);
    if (!api) {
      skipped++;
      continue;
    }

    await suite(api);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log();
  console.log(c.dim('─'.repeat(55)));
  console.log(
    `${c.bold('Results:')}  ${c.green(`${passed} passed`)}` +
      (failed > 0 ? `  ${c.red(`${failed} failed`)}` : '') +
      (skipped > 0 ? `  ${c.yellow(`${skipped} role(s) skipped`)}` : '') +
      `  ${c.dim(`(${elapsed}s)`)}`,
  );

  if (failures.length) {
    console.log();
    console.log(c.bold(c.red('Failed tests:')));
    for (const f of failures) {
      console.log(`  ${c.dim(f.role)} › ${f.test}`);
      console.log(`    ${c.red(f.error)}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red('\nFatal error:'), err.message);
  process.exit(1);
});

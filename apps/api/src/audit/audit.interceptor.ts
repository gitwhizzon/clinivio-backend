import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuditService } from './audit.service';

// ── URL pattern table ──────────────────────────────────────────────────────────
// Ordered: most-specific first. First match wins.

const ROUTES: { pattern: RegExp; action: string; entityType: string }[] = [
  // Appointments — action routes
  {
    pattern: /\/appointments\/[^/]+\/confirm-payment$/,
    action: 'PAYMENT',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/check-in$/,
    action: 'CHECK_IN',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/undo-check-in$/,
    action: 'UNDO_CHECK_IN',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/start$/,
    action: 'START_CONSULTATION',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/complete$/,
    action: 'COMPLETE',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/send-to-pharmacy$/,
    action: 'SEND_TO_PHARMACY',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/cancel$/,
    action: 'CANCEL',
    entityType: 'Appointment',
  },
  {
    pattern: /\/appointments\/[^/]+\/consultation\/prescription$/,
    action: 'CREATE',
    entityType: 'Prescription',
  },
  {
    pattern: /\/appointments\/[^/]+\/consultation\/follow-up$/,
    action: 'CREATE',
    entityType: 'FollowUp',
  },
  {
    pattern: /\/appointments\/[^/]+\/consultation$/,
    action: 'SAVE',
    entityType: 'Consultation',
  },
  // Appointments — CRUD
  {
    pattern: /\/appointments\/[^/]+$/,
    action: 'UPDATE',
    entityType: 'Appointment',
  },
  { pattern: /\/appointments$/, action: 'CREATE', entityType: 'Appointment' },
  // Lab
  {
    pattern: /\/lab\/orders\/[^/]+\/status$/,
    action: 'STATUS_CHANGE',
    entityType: 'LabOrder',
  },
  {
    pattern: /\/lab\/orders\/[^/]+$/,
    action: 'UPDATE',
    entityType: 'LabOrder',
  },
  { pattern: /\/lab\/orders$/, action: 'CREATE', entityType: 'LabOrder' },
  // Invoices
  {
    pattern: /\/invoices\/[^/]+\/confirm-payment$/,
    action: 'PAYMENT',
    entityType: 'Invoice',
  },
  { pattern: /\/invoices\/[^/]+$/, action: 'UPDATE', entityType: 'Invoice' },
  { pattern: /\/invoices$/, action: 'CREATE', entityType: 'Invoice' },
  // IPD
  {
    pattern: /\/ipd\/admissions\/[^/]+\/discharge$/,
    action: 'DISCHARGE',
    entityType: 'IpdAdmission',
  },
  {
    pattern: /\/ipd\/admissions\/[^/]+\/ready-for-discharge$/,
    action: 'STATUS_CHANGE',
    entityType: 'IpdAdmission',
  },
  {
    pattern: /\/ipd\/admissions\/[^/]+$/,
    action: 'UPDATE',
    entityType: 'IpdAdmission',
  },
  {
    pattern: /\/ipd\/admissions$/,
    action: 'CREATE',
    entityType: 'IpdAdmission',
  },
  // Pharmacy
  {
    pattern: /\/pharmacy\/orders\/[^/]+\/dispense$/,
    action: 'DISPENSE',
    entityType: 'PharmacyOrder',
  },
  {
    pattern: /\/pharmacy\/orders\/[^/]+$/,
    action: 'UPDATE',
    entityType: 'PharmacyOrder',
  },
  // Patients
  { pattern: /\/patients\/[^/]+$/, action: 'UPDATE', entityType: 'Patient' },
  { pattern: /\/patients$/, action: 'CREATE', entityType: 'Patient' },
  // Users / staff
  {
    pattern: /\/users\/[^/]+\/password$/,
    action: 'CHANGE_PASSWORD',
    entityType: 'User',
  },
  { pattern: /\/users\/[^/]+$/, action: 'UPDATE', entityType: 'User' },
  { pattern: /\/users$/, action: 'CREATE', entityType: 'User' },
  // Slots
  { pattern: /\/slots\/[^/]+$/, action: 'UPDATE', entityType: 'DoctorSlot' },
  { pattern: /\/slots$/, action: 'CREATE', entityType: 'DoctorSlot' },
  // Departments
  {
    pattern: /\/departments\/[^/]+$/,
    action: 'UPDATE',
    entityType: 'Department',
  },
  { pattern: /\/departments$/, action: 'CREATE', entityType: 'Department' },
  // Tenant profile
  { pattern: /\/tenants\/[^/]+$/, action: 'UPDATE', entityType: 'Tenant' },
];

const SENSITIVE = new Set([
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'secret',
  'razorpayPaymentId',
]);

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE.has(k) ? '[REDACTED]' : sanitize(v),
    ]),
  );
}

function resolveRoute(
  method: string,
  url: string,
): { action: string; entityType: string } | null {
  const path = url.split('?')[0];
  for (const r of ROUTES) {
    if (r.pattern.test(path)) {
      const action = method === 'DELETE' ? 'DELETE' : r.action;
      return { action, entityType: r.entityType };
    }
  }
  // Catch-all for unmatched DELETE
  if (method === 'DELETE') return { action: 'DELETE', entityType: 'Unknown' };
  return null;
}

function extractId(url: string, response: unknown): string | undefined {
  // Prefer the entity ID in the response body
  if (
    response &&
    typeof response === 'object' &&
    'id' in (response as object)
  ) {
    return (response as Record<string, unknown>).id as string;
  }
  // Fall back to UUID found in the URL path
  const m = url.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1];
}

function buildDescription(
  action: string,
  entityType: string,
  body: Record<string, unknown>,
): string {
  switch (action) {
    case 'PAYMENT':
      return `${entityType} payment ₹${body?.amount ?? '?'} via ${body?.paymentMethod ?? 'unknown'}`;
    case 'CANCEL':
      return `${entityType} ${(body?.cancelStatus as string) ?? 'CANCELLED'}: ${body?.reason ?? '—'}`;
    case 'CHECK_IN':
      return 'Patient checked in';
    case 'UNDO_CHECK_IN':
      return 'Check-in reversed';
    case 'START_CONSULTATION':
      return 'Consultation started';
    case 'COMPLETE':
      return 'Consultation completed';
    case 'SEND_TO_PHARMACY':
      return 'Sent to pharmacy';
    case 'DISCHARGE':
      return 'Patient discharged from IPD';
    case 'DISPENSE':
      return 'Prescription dispensed';
    case 'CHANGE_PASSWORD':
      return 'Password changed';
    case 'STATUS_CHANGE':
      return `${entityType} status updated`;
    case 'SAVE':
      return `${entityType} notes saved`;
    case 'CREATE':
      return `${entityType} created`;
    case 'UPDATE':
      return `${entityType} updated`;
    case 'DELETE':
      return `${entityType} deleted`;
    default:
      return `${action} on ${entityType}`;
  }
}

// ── Interceptor ────────────────────────────────────────────────────────────────

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body: Record<string, unknown>;
      // JwtStrategy.validate() returns { sub, id, tenantId, role, email } — there
      // is no `userId` field. Using `sub` here (both `id` and `sub` alias the
      // same value) — using a nonexistent `userId` silently wrote every audit
      // row with userId: undefined, breaking "who did this" attribution.
      user?: { sub: string; email: string; role: string; tenantId: string };
      ip: string;
      headers: Record<string, string>;
    }>();

    const { method, url, body, user, ip } = req;

    // Only audit mutating operations on authenticated requests
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || !user) {
      return next.handle();
    }

    const route = resolveRoute(method, url);
    if (!route) return next.handle();

    const { action, entityType } = route;
    const sanitizedBody = sanitize(body) as Record<string, unknown>;
    const description = buildDescription(action, entityType, sanitizedBody);
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? ip;

    return next.handle().pipe(
      tap((response: unknown) => {
        this.auditService.log({
          tenantId: user.tenantId,
          userId: user.sub,
          userEmail: user.email,
          userRole: user.role,
          action,
          entityType,
          entityId: extractId(url, response),
          description,
          after: sanitizedBody,
          metadata: {},
          ipAddress: clientIp,
          success: true,
        });
      }),
      catchError((err: Error) => {
        this.auditService.log({
          tenantId: user.tenantId,
          userId: user.sub,
          userEmail: user.email,
          userRole: user.role,
          action,
          entityType,
          entityId: extractId(url, null),
          description: `FAILED: ${description}`,
          after: sanitizedBody,
          metadata: { error: err?.message },
          ipAddress: clientIp,
          success: false,
        });
        return throwError(() => err);
      }),
    );
  }
}

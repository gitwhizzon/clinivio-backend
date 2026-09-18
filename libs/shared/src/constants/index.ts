/**
 * Subdomains that are always the platform host (app.megnim.com,
 * api.megnim.com, ...), never a tenant. Must stay in sync with the
 * frontend's PLATFORM_SUBDOMAINS in lib/tenant.ts (separate repo, can't
 * share this constant directly) — this copy is the one that matters for
 * blocking a colliding tenant slug at onboarding time, since that's the
 * only point where creating one is actually preventable.
 */
export const RESERVED_TENANT_SLUGS = ['www', 'admin', 'api', 'app'] as const;

export enum KAFKA_TOPICS {
  PATIENT_REGISTERED = 'mediflow.patient.registered',
  APPOINTMENT_BOOKED = 'mediflow.appointment.booked',
  APPOINTMENT_COMPLETED = 'mediflow.appointment.completed',
  APPOINTMENT_CANCELLED = 'mediflow.appointment.cancelled',
  CONSULTATION_SAVED = 'mediflow.consultation.saved',
  PRESCRIPTION_CREATED = 'mediflow.prescription.created',
  PAYMENT_CAPTURED = 'mediflow.payment.captured',
  PAYMENT_FAILED = 'mediflow.payment.failed',
  WHATSAPP_INBOUND_MESSAGE = 'mediflow.whatsapp.inbound',
  WHATSAPP_OUTBOUND_MESSAGE = 'mediflow.whatsapp.outbound',
  WHATSAPP_STATUS_UPDATE = 'mediflow.whatsapp.status',
  NOTIFICATION_QUEUE = 'mediflow.notification.queue',
  AUDIT_EVENTS = 'mediflow.audit.events',
}

export enum ROLES {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  RECEPTIONIST = 'RECEPTIONIST',
  PHARMACIST = 'PHARMACIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
}

export enum FSM_STATES {
  IDLE = 'IDLE',
  LANGUAGE_SELECTION = 'LANGUAGE_SELECTION',
  REGISTRATION_NAME = 'REGISTRATION_NAME',
  REGISTRATION_DOB = 'REGISTRATION_DOB',
  REGISTRATION_GENDER = 'REGISTRATION_GENDER',
  REGISTRATION_ABHA = 'REGISTRATION_ABHA',
  REGISTRATION_CONSENT = 'REGISTRATION_CONSENT',
  REGISTRATION_OTP = 'REGISTRATION_OTP',
  MAIN_MENU = 'MAIN_MENU',
  BOOKING_SPECIALTY = 'BOOKING_SPECIALTY',
  BOOKING_DOCTOR = 'BOOKING_DOCTOR',
  BOOKING_DATE = 'BOOKING_DATE',
  BOOKING_SLOT = 'BOOKING_SLOT',
  BOOKING_TYPE = 'BOOKING_TYPE',
  BOOKING_COMPLAINT = 'BOOKING_COMPLAINT',
  BOOKING_PAYMENT = 'BOOKING_PAYMENT',
  BOOKING_CONFIRM = 'BOOKING_CONFIRM',
}

export enum LANGUAGES {
  EN = 'EN',
  HI = 'HI',
  TA = 'TA',
  TE = 'TE',
  KN = 'KN',
  BN = 'BN',
}

// ─── All Domain Enums ─────────────────────────────────────────────────────────

export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  NURSE = "NURSE",
  RECEPTIONIST = "RECEPTIONIST",
  PHARMACIST = "PHARMACIST",
  LAB_TECHNICIAN = "LAB_TECHNICIAN",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY",
}

export enum Language {
  EN = "EN",
  HI = "HI",
  TA = "TA",
  TE = "TE",
  KN = "KN",
  BN = "BN",
}

export enum VisitType {
  OPD = "OPD",
  IPD = "IPD",
}

export enum AppointmentType {
  IN_PERSON = "IN_PERSON",
  VIDEO = "VIDEO",
  FOLLOW_UP = "FOLLOW_UP",
}

export enum AppointmentStatus {
  REGISTERED = "REGISTERED",
  PENDING_PAYMENT = "PENDING_PAYMENT",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  SENT_TO_PHARMACY = "SENT_TO_PHARMACY",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
}

export enum PaymentStatus {
  PENDING = "PENDING",
export enum PaymentStatus {
  PENDING = "PENDING",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  REFUNDED = "REFUNDED",
  FAILED = "FAILED",
}

export enum DiscountType {
  PERCENTAGE = "PERCENTAGE",
  FLAT = "FLAT",
}

export enum InvoiceType {
}

export enum InvoiceType {
  CONSULTATION = "CONSULTATION",
  PHARMACY = "PHARMACY",
  PROCEDURE = "PROCEDURE",
  LAB = "LAB",
  PACKAGE = "PACKAGE",
}

export enum NotificationChannel {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
  EMAIL = "EMAIL",
  PRINT = "PRINT",
}

export enum NotificationStatus {
  QUEUED = "QUEUED",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}

export enum SubscriptionTier {
  BASIC = "BASIC",
  STANDARD = "STANDARD",
  PREMIUM = "PREMIUM",
  ENTERPRISE = "ENTERPRISE",
}

export enum PharmacyOrderStatus {
  PENDING = "PENDING",
  DISPENSING = "DISPENSING",
  DISPENSED = "DISPENSED",
  RETURNED = "RETURNED",
}

export enum RoomType {
  GENERAL_WARD = "GENERAL_WARD",
  SEMI_PRIVATE = "SEMI_PRIVATE",
  PRIVATE = "PRIVATE",
  ICU = "ICU",
}

export enum BedStatus {
  AVAILABLE = "AVAILABLE",
  OCCUPIED = "OCCUPIED",
  UNDER_MAINTENANCE = "UNDER_MAINTENANCE",
}

export enum IPDAdmissionStatus {
  ADMITTED = "ADMITTED",
  UNDER_TREATMENT = "UNDER_TREATMENT",
  READY_FOR_DISCHARGE = "READY_FOR_DISCHARGE",
  DISCHARGED = "DISCHARGED",
}

export enum LabOrderStatus {
  PENDING = "PENDING",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum LabResultFlag {
  NORMAL = "NORMAL",
  ABNORMAL = "ABNORMAL",
  CRITICAL = "CRITICAL",
}

// ─── Operation Theater ────────────────────────────────────────────────────────

export enum OTTheaterType {
  GENERAL = "GENERAL",
  CARDIAC = "CARDIAC",
  ORTHOPEDIC = "ORTHOPEDIC",
  OBSTETRIC = "OBSTETRIC",
  LAPAROSCOPY = "LAPAROSCOPY",
  NEUROLOGY = "NEUROLOGY",
  OPHTHALMOLOGY = "OPHTHALMOLOGY",
  ENT = "ENT",
}

export enum OTTheaterStatus {
  AVAILABLE = "AVAILABLE",
  OCCUPIED = "OCCUPIED",
  CLEANING = "CLEANING",
  MAINTENANCE = "MAINTENANCE",
}

export enum OTScheduleStatus {
  SCHEDULED = "SCHEDULED",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  POSTPONED = "POSTPONED",
}

export enum OTPriority {
  ELECTIVE = "ELECTIVE",
  URGENT = "URGENT",
  EMERGENCY = "EMERGENCY",
}

export enum AnaesthesiaType {
  GENERAL = "GENERAL",
  SPINAL = "SPINAL",
  EPIDURAL = "EPIDURAL",
  LOCAL = "LOCAL",
  SEDATION = "SEDATION",
}
}

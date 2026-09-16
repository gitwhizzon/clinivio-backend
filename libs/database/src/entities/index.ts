export * from "./enums";
export * from "./tenant.entity";
export * from "./user.entity";
export * from "./department.entity";
export * from "./doctor-profile.entity";
export * from "./staff-profile.entity";
export * from "./patient-family.entity";
export * from "./patient.entity";
export * from "./patient-account.entity";
export * from "./doctor-slot.entity";
export * from "./appointment.entity";
export * from "./consultation.entity";
export * from "./prescription.entity";
export * from "./follow-up.entity";
export * from "./pharmacy.entity";
export * from "./invoice.entity";
export * from "./invoice-payment.entity";
export * from "./billable-service.entity";
export * from "./notification-log.entity";
export * from "./ipd.entity";
export * from "./lab.entity";
export * from "./audit-log.entity";
export * from "./ot.entity";

// Convenience: all entities as array for TypeORM forFeature / forRoot
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { Department } from "./department.entity";
import { DoctorProfile } from "./doctor-profile.entity";
import { StaffProfile } from "./staff-profile.entity";
import { PatientFamily } from "./patient-family.entity";
import { Patient } from "./patient.entity";
import { PatientAccount } from "./patient-account.entity";
import { DoctorSlot } from "./doctor-slot.entity";
import { Appointment } from "./appointment.entity";
import { Consultation } from "./consultation.entity";
import { Prescription, PrescriptionItem } from "./prescription.entity";
import { FollowUp } from "./follow-up.entity";
import {
  PharmacyOrder,
  PharmacyInventory,
  PharmacyPurchase,
  PharmacyPurchaseItem,
} from "./pharmacy.entity";
import { Invoice } from "./invoice.entity";
import { InvoicePayment } from "./invoice-payment.entity";
import { BillableService } from "./billable-service.entity";
import { NotificationLog } from "./notification-log.entity";
import {
  Room,
  Bed,
  IPDAdmission,
  IPDVitalSnapshot,
  IPDTreatment,
  IPDProcedure,
  DischargeAdvice,
  DischargeSummary,
} from "./ipd.entity";
import {
  LabTest,
  LabOrder,
  LabOrderItem,
  LabReagent,
  LabReagentUsage,
} from "./lab.entity";
import { AuditLog } from "./audit-log.entity";
import { OTTheater, OTSchedule, OTRecord } from "./ot.entity";

export const ALL_ENTITIES = [
  Tenant,
  User,
  Department,
  DoctorProfile,
  StaffProfile,
  PatientFamily,
  Patient,
  PatientAccount,
  DoctorSlot,
  Appointment,
  Consultation,
  Prescription,
  PrescriptionItem,
  FollowUp,
  PharmacyOrder,
  PharmacyInventory,
  PharmacyPurchase,
  PharmacyPurchaseItem,
  Invoice,
  InvoicePayment,
  BillableService,
  NotificationLog,
  Room,
  Bed,
  IPDAdmission,
  IPDVitalSnapshot,
  IPDTreatment,
  IPDProcedure,
  DischargeAdvice,
  DischargeSummary,
  LabTest,
  LabOrder,
  LabOrderItem,
  LabReagent,
  LabReagentUsage,
  AuditLog,
  OTTheater,
  OTSchedule,
  OTRecord,
];

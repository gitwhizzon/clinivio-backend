import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { RoomType, BedStatus, IPDAdmissionStatus } from "./enums";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { Patient } from "./patient.entity";

// ─── Room ─────────────────────────────────────────────────────────────────────

@Entity("rooms")
@Index(["tenantId"])
@Index(["tenantId", "roomType"])
export class Room {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: "room_type", type: "enum", enum: RoomType })
  roomType: RoomType;

  @Column({ nullable: true })
  floor: string | null;

  @Column({ name: "total_beds", type: "int" })
  totalBeds: number;

  @Column({ name: "price_per_day", type: "decimal", precision: 10, scale: 2 })
  pricePerDay: string;

  @Column({ type: "jsonb", nullable: true })
  amenities: any | null;

  @Column({ nullable: true })
  notes: string | null;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @OneToMany("Bed", "room", { eager: false })
  beds: any[];

  @OneToMany("IPDAdmission", "room", { eager: false })
  admissions: any[];
}

// ─── Bed ──────────────────────────────────────────────────────────────────────

@Entity("beds")
@Unique("room_bed_unique", ["roomId", "bedNumber"])
@Index(["tenantId"])
@Index(["tenantId", "status"])
export class Bed {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "room_id" })
  roomId: string;

  @Column({ name: "bed_number" })
  bedNumber: string;

  @Column({ type: "enum", enum: BedStatus, default: BedStatus.AVAILABLE })
  status: BedStatus;

  @Column({ nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Room, (room) => room.beds, { onDelete: "CASCADE" })
  @JoinColumn({ name: "room_id" })
  room: Room;

  @OneToMany("IPDAdmission", "bed", { eager: false })
  admissions: any[];
}

// ─── IPD Admission ────────────────────────────────────────────────────────────

@Entity("ipd_admissions")
@Unique("tenant_admission_number_unique", ["tenantId", "admissionNumber"])
@Index(["tenantId"])
@Index(["tenantId", "status"])
@Index(["tenantId", "patientId"])
export class IPDAdmission {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column({ name: "attending_doctor_id" })
  attendingDoctorId: string;

  @Column({ name: "appointment_id", nullable: true, unique: true })
  appointmentId: string | null;

  @Column({ name: "room_id" })
  roomId: string;

  @Column({ name: "bed_id" })
  bedId: string;

  @Column({ name: "admission_number" })
  admissionNumber: string;

  @Column({
    type: "enum",
    enum: IPDAdmissionStatus,
    default: IPDAdmissionStatus.ADMITTED,
  })
  status: IPDAdmissionStatus;

  @Column({ name: "admission_reason" })
  admissionReason: string;

  @Column({ name: "referred_by", nullable: true })
  referredBy: string | null;

  @Column({ name: "opinion_obtained_by", nullable: true })
  opinionObtainedBy: string | null;

  @Column({
    name: "admitted_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  admittedAt: Date;

  @Column({
    name: "estimated_discharge_at",
    type: "timestamptz",
    nullable: true,
  })
  estimatedDischargeAt: Date | null;

  @Column({ name: "discharged_at", type: "timestamptz", nullable: true })
  dischargedAt: Date | null;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Patient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patient_id" })
  patient: Patient;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "attending_doctor_id" })
  attendingDoctor: User;

  @ManyToOne(() => Room, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "room_id" })
  room: Room;

  @ManyToOne(() => Bed, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "bed_id" })
  bed: Bed;

  @OneToMany("IPDVitalSnapshot", "admission", { eager: false })
  vitalSnapshots: any[];

  @OneToMany("IPDTreatment", "admission", { eager: false })
  treatments: any[];

  @OneToMany("IPDProcedure", "admission", { eager: false })
  procedures: any[];

  @OneToOne("DischargeAdvice", "admission", { eager: false })
  dischargeAdvice: any;

  @OneToOne("DischargeSummary", "admission", { eager: false })
  dischargeSummary: any;

  @OneToMany("Invoice", "ipdAdmission", { eager: false })
  invoices: any[];

  @OneToOne("Appointment", "ipdAdmission", { nullable: true, eager: false })
  @JoinColumn({ name: "appointment_id" })
  appointment: any;
}

// ─── IPD Vital Snapshot ───────────────────────────────────────────────────────

@Entity("ipd_vital_snapshots")
@Index(["admissionId"])
@Index(["tenantId", "admissionId"])
export class IPDVitalSnapshot {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "admission_id" })
  admissionId: string;

  @Column({ name: "recorded_by_id" })
  recordedById: string;

  @Column({ name: "bp_systolic", type: "int", nullable: true })
  bpSystolic: number | null;

  @Column({ name: "bp_diastolic", type: "int", nullable: true })
  bpDiastolic: number | null;

  @Column({ name: "pulse_rate", type: "int", nullable: true })
  pulseRate: number | null;

  @Column({ type: "decimal", precision: 4, scale: 1, nullable: true })
  temperature: string | null;

  @Column({
    name: "weight_kg",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  weightKg: string | null;

  @Column({
    name: "height_cm",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  heightCm: string | null;

  @Column({ type: "decimal", precision: 4, scale: 1, nullable: true })
  bmi: string | null;

  @Column({ type: "int", nullable: true })
  spo2: number | null;

  @Column({
    name: "rbs_mg_dl",
    type: "decimal",
    precision: 5,
    scale: 1,
    nullable: true,
  })
  rbsMgDl: string | null;

  @Column({ name: "respiratory_rate", type: "int", nullable: true })
  respiratoryRate: number | null;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @Column({
    name: "recorded_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  recordedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => IPDAdmission, (a) => a.vitalSnapshots, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "admission_id" })
  admission: IPDAdmission;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "recorded_by_id" })
  recordedBy: User;
}

// ─── IPD Treatment ────────────────────────────────────────────────────────────

@Entity("ipd_treatments")
@Index(["admissionId"])
@Index(["tenantId"])
export class IPDTreatment {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "admission_id" })
  admissionId: string;

  @Column({ name: "ordered_by_id" })
  orderedById: string;

  @Column({ name: "treatment_name" })
  treatmentName: string;

  @Column({ nullable: true, type: "text" })
  instructions: string | null;

  @Column({
    name: "started_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  startedAt: Date;

  @Column({ name: "ended_at", type: "timestamptz", nullable: true })
  endedAt: Date | null;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => IPDAdmission, (a) => a.treatments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admission_id" })
  admission: IPDAdmission;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "ordered_by_id" })
  orderedBy: User;
}

// ─── IPD Procedure ────────────────────────────────────────────────────────────

@Entity("ipd_procedures")
@Index(["admissionId"])
@Index(["tenantId"])
export class IPDProcedure {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "admission_id" })
  admissionId: string;

  @Column({ name: "performed_by_id" })
  performedById: string;

  @Column({ name: "procedure_name" })
  procedureName: string;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @Column({ name: "photo_urls", type: "text", array: true, default: [] })
  photoUrls: string[];

  @Column({ nullable: true, type: "text" })
  outcomes: string | null;

  @Column({ nullable: true, type: "text" })
  complications: string | null;

  @Column({
    name: "performed_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  performedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => IPDAdmission, (a) => a.procedures, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admission_id" })
  admission: IPDAdmission;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "performed_by_id" })
  performedBy: User;
}

// ─── Discharge Advice ─────────────────────────────────────────────────────────

@Entity("discharge_advice")
@Index(["tenantId"])
export class DischargeAdvice {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "admission_id", unique: true })
  admissionId: string;

  @Column({ name: "created_by_id" })
  createdById: string;

  @Column({ nullable: true, type: "text" })
  medications: string | null;

  @Column({ name: "diet_advice", nullable: true, type: "text" })
  dietAdvice: string | null;

  @Column({ name: "activity_advice", nullable: true, type: "text" })
  activityAdvice: string | null;

  @Column({ name: "wound_care", nullable: true, type: "text" })
  woundCare: string | null;

  @Column({ name: "other_advice", nullable: true, type: "text" })
  otherAdvice: string | null;

  @Column({ name: "follow_up_date", type: "date", nullable: true })
  followUpDate: string | null;

  @Column({ name: "follow_up_notes", nullable: true, type: "text" })
  followUpNotes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @OneToOne(() => IPDAdmission, (a) => a.dischargeAdvice, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "admission_id" })
  admission: IPDAdmission;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by_id" })
  createdBy: User;
}

// ─── Discharge Summary ────────────────────────────────────────────────────────

@Entity("discharge_summaries")
@Index(["tenantId"])
export class DischargeSummary {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "admission_id", unique: true })
  admissionId: string;

  @Column({ name: "generated_by_id" })
  generatedById: string;

  @Column({ name: "final_diagnosis", type: "text" })
  finalDiagnosis: string;

  @Column({ name: "presenting_complaints", type: "text" })
  presentingComplaints: string;

  @Column({ name: "treatment_summary", type: "text" })
  treatmentSummary: string;

  @Column({ name: "procedures_done", nullable: true, type: "text" })
  proceduresDone: string | null;

  @Column({ name: "investigation_findings", nullable: true, type: "text" })
  investigationFindings: string | null;

  @Column({ name: "condition_at_discharge", type: "text" })
  conditionAtDischarge: string;

  @Column({ name: "pdf_s3_key", nullable: true })
  pdfS3Key: string | null;

  @Column({
    name: "generated_at",
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
  })
  generatedAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @OneToOne(() => IPDAdmission, (a) => a.dischargeSummary, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "admission_id" })
  admission: IPDAdmission;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "generated_by_id" })
  generatedBy: User;
}

import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Appointment } from "./appointment.entity";
import { User } from "./user.entity";
import { Patient } from "./patient.entity";

@Entity("consultations")
export class Consultation {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "appointment_id", unique: true })
  appointmentId: string;

  @Column({ name: "doctor_id" })
  doctorId: string;

  @Column({ name: "patient_id" })
  patientId: string;

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
  observations: string | null;

  @Column({ nullable: true, type: "text" })
  diagnosis: string | null;

  @Column({ name: "icd_codes", type: "text", array: true, default: [] })
  icdCodes: string[];

  @Column({ name: "doctor_notes", nullable: true, type: "text" })
  doctorNotes: string | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt: Date | null;

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

  @OneToOne(() => Appointment, (a: any) => a.consultation, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "appointment_id" })
  appointment: Appointment;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "doctor_id" })
  doctor: User;

  @ManyToOne(() => Patient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patient_id" })
  patient: Patient;

  @OneToMany("Prescription", "consultation", { cascade: false, eager: false })
  prescriptions: any[];

  @OneToMany("FollowUp", "consultation", { cascade: false, eager: false })
  followUps: any[];
}

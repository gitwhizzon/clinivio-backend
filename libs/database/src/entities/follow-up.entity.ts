import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Consultation } from "./consultation.entity";
import { Patient } from "./patient.entity";

@Entity("follow_ups")
export class FollowUp {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "consultation_id" })
  consultationId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column({ name: "doctor_id" })
  doctorId: string;

  @Column({ name: "follow_up_date", type: "date" })
  followUpDate: string;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @Column({ name: "reminder_sent_at", type: "timestamptz", nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: "is_completed", default: false })
  isCompleted: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Consultation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "consultation_id" })
  consultation: Consultation;

  @ManyToOne(() => Patient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patient_id" })
  patient: Patient;
}

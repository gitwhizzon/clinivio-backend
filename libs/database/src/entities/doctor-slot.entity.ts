import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { DoctorProfile } from "./doctor-profile.entity";

@Entity("doctor_slots")
@Unique("tenant_doctor_slot_unique", [
  "tenantId",
  "doctorId",
  "slotDate",
  "startTime",
])
export class DoctorSlot {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "doctor_id" })
  doctorId: string;

  @Column({ name: "slot_date", type: "date" })
  slotDate: string;

  @Column({ name: "start_time" })
  startTime: string;

  @Column({ name: "end_time" })
  endTime: string;

  @Column({ name: "duration_minutes", type: "int", default: 30 })
  durationMinutes: number;

  @Column({ name: "max_patients", type: "int", default: 1 })
  maxPatients: number;

  @Column({ name: "booked_count", type: "int", default: 0 })
  bookedCount: number;

  @Column({ name: "is_blocked", default: false })
  isBlocked: boolean;

  @Column({ name: "block_reason", nullable: true })
  blockReason: string | null;

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

  @ManyToOne(() => DoctorProfile, { onDelete: "CASCADE" })
  @JoinColumn({ name: "doctor_id" })
  doctor: DoctorProfile;
}

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
  Index,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Patient } from "./patient.entity";

@Entity("patient_accounts")
@Unique("tenant_patient_account_phone_unique", ["tenantId", "phone"])
@Index(["tenantId", "phone"])
export class PatientAccount {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column()
  phone: string;

  @Column({ name: "password_hash", select: false })
  passwordHash: string;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt: Date | null;

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
}

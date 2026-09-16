import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from "typeorm";
import { Tenant } from "./tenant.entity";

@Entity("patient_families")
@Unique("tenant_family_whatsapp_unique", ["tenantId", "whatsappPhone"])
export class PatientFamily {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "whatsapp_phone" })
  whatsappPhone: string;

  @Column({ name: "primary_patient_id", nullable: true })
  primaryPatientId: string | null;

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

  @OneToMany("Patient", "family", { cascade: false, eager: false })
  patients: any[];
}

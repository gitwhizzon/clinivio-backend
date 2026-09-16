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
import { DoctorProfile } from "./doctor-profile.entity";

@Entity("departments")
@Unique("tenant_department_code_unique", ["tenantId", "code"])
export class Department {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  description: string | null;

  @Column({ nullable: true })
  icon: string | null;

  @Column({ nullable: true, default: "#3B82F6" })
  color: string | null;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "sort_order", default: 0 })
  sortOrder: number;

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

  @OneToMany(() => DoctorProfile, (dp) => dp.department)
  doctors: DoctorProfile[];

  @OneToMany("Appointment", "department", { cascade: false, eager: false })
  appointments: any[];
}

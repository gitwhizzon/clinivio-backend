import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { User } from "./user.entity";
import { Department } from "./department.entity";

@Entity("doctor_profiles")
export class DoctorProfile {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "user_id", unique: true })
  userId: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "department_id", nullable: true })
  departmentId: string | null;

  @Column({ name: "registration_no", nullable: true })
  registrationNo: string | null;

  @Column({ nullable: true })
  specialty: string | null;

  @Column({ name: "sub_specialty", nullable: true })
  subSpecialty: string | null;

  @Column({ nullable: true })
  qualification: string | null;

  @Column({ name: "experience_years", type: "int", nullable: true })
  experienceYears: number | null;

  @Column({
    name: "consultation_fee",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  consultationFee: string | null;

  @Column({ type: "text", array: true, default: ["EN"] })
  languages: string[];

  @Column({ name: "availability_schedule", type: "jsonb", nullable: true })
  availabilitySchedule: any | null;

  @Column({ name: "is_accepting_patients", default: true })
  isAcceptingPatients: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Department, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "department_id" })
  department: Department | null;

  slots: any[];
}

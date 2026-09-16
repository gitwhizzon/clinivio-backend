import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Department } from './department.entity';

/**
 * Generic staff profile for non-doctor roles:
 * NURSE | RECEPTIONIST | LAB_TECHNICIAN | PHARMACIST
 *
 * Role-specific details are captured here.
 * user_id has a unique constraint so there is exactly one profile per user.
 */
@Entity('staff_profiles')
export class StaffProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  /** Employee / staff ID assigned by the hospital */
  @Column({ name: 'employee_id', nullable: true })
  employeeId: string | null;

  /** Highest academic / professional qualification, e.g. GNM, DMLT, D.Pharm */
  @Column({ nullable: true })
  qualification: string | null;

  /**
   * Statutory registration number
   *   Nurse       → NNC / State Nursing Council reg.
   *   Lab Tech    → DMLT / BMLT cert / NABL ID
   *   Pharmacist  → State Pharmacy Council license
   *   Receptionist→ not applicable (leave blank)
   */
  @Column({ name: 'registration_no', nullable: true })
  registrationNo: string | null;

  /** Department / ward assignment */
  @Column({ name: 'department_id', nullable: true })
  departmentId: string | null;

  /** Date of joining */
  @Column({ name: 'joining_date', type: 'date', nullable: true })
  joiningDate: string | null;

  /** Shift preference: MORNING | AFTERNOON | NIGHT | ROTATIONAL */
  @Column({ nullable: true })
  shift: string | null;

  /** Years of professional experience */
  @Column({ name: 'experience_years', type: 'int', nullable: true })
  experienceYears: number | null;

  /** Area of specialization, e.g. ICU Nursing, Clinical Biochemistry, Retail Pharmacy */
  @Column({ nullable: true })
  specialization: string | null;

  /** Free-form extra attributes (e.g. languages known for receptionist) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne('User', 'staffProfile', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: any;

  @ManyToOne(() => Tenant, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;
}

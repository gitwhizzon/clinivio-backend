import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Department } from './department.entity';

/**
 * A clinic-defined in-house billable service (scanning, dressing,
 * observation, etc.) — distinct from doctor consultation and lab tests.
 * Selected on the billing page as an extra invoice line item alongside the
 * consultation fee. Mirrors Department's tenant-scoped-catalog shape.
 */
@Entity('billable_services')
@Unique('tenant_billable_service_code_unique', ['tenantId', 'code'])
export class BillableService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  category: string | null;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'is_taxable', default: true })
  isTaxable: boolean;

  @Column({
    name: 'gst_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  gstPercent: string | null;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

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

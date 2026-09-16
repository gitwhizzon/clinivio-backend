import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { LabOrderStatus, LabResultFlag } from './enums';
import { Tenant } from './tenant.entity';
import { Patient } from './patient.entity';
import { User } from './user.entity';

// ─── Lab Test Catalog ─────────────────────────────────────────────────────────

@Entity('lab_tests')
@Unique('tenant_lab_test_code_unique', ['tenantId', 'code'])
@Index(['tenantId'])
export class LabTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  unit: string | null;

  @Column({ name: 'normal_range', nullable: true })
  normalRange: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: string;

  @Column({
    name: 'gst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  gstRate: string | null;

  @Column({ name: 'turnaround_hours', type: 'int', default: 24 })
  turnaround: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

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

  @OneToMany('LabOrderItem', 'labTest', { eager: false })
  orderItems: any[];
}

// ─── Lab Order ────────────────────────────────────────────────────────────────

@Entity('lab_orders')
@Unique('tenant_lab_order_number_unique', ['tenantId', 'orderNumber'])
@Index(['tenantId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'patientId'])
export class LabOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'order_number' })
  orderNumber: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'appointment_id', nullable: true })
  appointmentId: string | null;

  @Column({ name: 'ordered_by_id' })
  orderedById: string;

  @Column({ name: 'assigned_to_id', nullable: true })
  assignedToId: string | null;

  @Column({
    type: 'enum',
    enum: LabOrderStatus,
    default: LabOrderStatus.PENDING,
  })
  status: LabOrderStatus;

  @Column({ default: 'ROUTINE' })
  priority: string;

  @Column({ name: 'clinical_notes', nullable: true, type: 'text' })
  clinicalNotes: string | null;

  @Column({ name: 'sample_type', nullable: true })
  sampleType: string | null;

  @Column({ name: 'collected_at', type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'payment_status', default: 'UNPAID' })
  paymentStatus: string;

  @Column({
    name: 'amount_due',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  amountDue: string;

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  amountPaid: string;

  @Column({ name: 'payment_method', nullable: true })
  paymentMethod: string | null;

  @Column({ name: 'payment_collected_at', type: 'timestamptz', nullable: true })
  paymentCollectedAt: Date | null;

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

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ordered_by_id' })
  orderedBy: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: User | null;

  @ManyToOne('Appointment', 'labOrders', {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment: any;

  @OneToMany('LabOrderItem', 'labOrder', { cascade: true, eager: false })
  items: any[];
}

// ─── Lab Order Item ───────────────────────────────────────────────────────────

@Entity('lab_order_items')
export class LabOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lab_order_id' })
  labOrderId: string;

  @Column({ name: 'lab_test_id' })
  labTestId: string;

  @Column({ nullable: true, type: 'text' })
  result: string | null;

  @Column({ nullable: true })
  unit: string | null;

  @Column({ name: 'normal_range', nullable: true })
  normalRange: string | null;

  @Column({ type: 'enum', enum: LabResultFlag, nullable: true })
  flag: LabResultFlag | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @Column({ name: 'is_outsourced', default: false })
  isOutsourced: boolean;

  @Column({ name: 'external_lab_name', nullable: true })
  externalLabName: string | null;

  @Column({ name: 'external_reference', nullable: true })
  externalReference: string | null;

  @Column({ name: 'outsourced_at', type: 'timestamptz', nullable: true })
  outsourcedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => LabOrder, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lab_order_id' })
  labOrder: LabOrder;

  @ManyToOne(() => LabTest, (t) => t.orderItems, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lab_test_id' })
  labTest: LabTest;
}

@Entity('lab_reagents')
export class LabReagent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column()
  unit: string;

  @Column({
    name: 'current_qty',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  currentQty: string;

  @Column({
    name: 'reorder_level',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 10,
  })
  reorderLevel: string;

  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  unitCost: string;

  @Column({ nullable: true })
  manufacturer: string | null;

  @Column({ name: 'batch_no', nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

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

  @OneToMany(() => LabReagentUsage, (u) => u.reagent)
  usageLog: LabReagentUsage[];
}

@Entity('lab_reagent_usage')
export class LabReagentUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'reagent_id' })
  reagentId: string;

  @Column({ name: 'lab_order_id', nullable: true })
  labOrderId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: string;

  @Column({ default: 'USE' })
  type: string;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @Column({ name: 'used_by', nullable: true })
  usedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => LabReagent, (r) => r.usageLog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reagent_id' })
  reagent: LabReagent;

  @ManyToOne(() => Tenant, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}

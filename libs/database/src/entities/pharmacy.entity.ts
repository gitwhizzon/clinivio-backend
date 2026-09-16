import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PharmacyOrderStatus } from './enums';
import { Tenant } from './tenant.entity';
import { Appointment } from './appointment.entity';
import { Patient } from './patient.entity';

@Entity('pharmacy_orders')
export class PharmacyOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'appointment_id', unique: true })
  appointmentId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'prescription_id', nullable: true, unique: true })
  prescriptionId: string | null;

  @Column({
    type: 'enum',
    enum: PharmacyOrderStatus,
    default: PharmacyOrderStatus.PENDING,
  })
  status: PharmacyOrderStatus;

  @Column({ name: 'dispenser_notes', nullable: true })
  dispenserNotes: string | null;

  @Column({ name: 'dispensed_at', type: 'timestamptz', nullable: true })
  dispensedAt: Date | null;

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

  @OneToOne(() => Appointment, (a: any) => a.pharmacyOrder, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;
}

@Entity('pharmacy_inventory')
export class PharmacyInventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'generic_name', nullable: true })
  genericName: string | null;

  @Column({ nullable: true })
  category: string | null;

  @Column({ default: 'Tablet' })
  unit: string;

  @Column({ name: 'stock_qty', type: 'int', default: 0 })
  stockQty: number;

  @Column({ name: 'reorder_level', type: 'int', default: 10 })
  reorderLevel: number;

  @Column({ name: 'batch_no', nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  mrp: string;

  @Column({
    name: 'selling_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  sellingPrice: string;

  @Column({
    name: 'gst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  gstRate: string | null;

  @Column({ nullable: true })
  manufacturer: string | null;

  @Column({ nullable: true })
  hsn: string | null;

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
}

@Entity('pharmacy_purchases')
export class PharmacyPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'vendor_name' })
  vendorName: string;

  @Column({ name: 'invoice_no', nullable: true })
  invoiceNo: string | null;

  @Column({ name: 'purchase_date', type: 'date' })
  purchaseDate: string;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalAmount: string;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  discountAmount: string;

  @Column({ nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => PharmacyPurchaseItem, (item) => item.purchase, {
    cascade: true,
    eager: true,
  })
  items: PharmacyPurchaseItem[];

  @ManyToOne(() => Tenant, {
    onDelete: 'CASCADE',
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}

@Entity('pharmacy_purchase_items')
export class PharmacyPurchaseItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_id' })
  purchaseId: string;

  @Column({ name: 'inventory_id', nullable: true })
  inventoryId: string | null;

  @Column({ name: 'medicine_name' })
  medicineName: string;

  @Column({ name: 'batch_no', nullable: true })
  batchNo: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'free_qty', type: 'int', default: 0 })
  freeQty: number;

  @Column({
    name: 'purchase_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  purchasePrice: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  mrp: string | null;

  @Column({
    name: 'selling_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  sellingPrice: string | null;

  @Column({
    name: 'discount_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  discountPercent: string;

  @Column({
    name: 'gst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  gstRate: string | null;

  @Column({
    name: 'line_total',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lineTotal: string;

  @ManyToOne(() => PharmacyPurchase, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_id' })
  purchase: PharmacyPurchase;
}

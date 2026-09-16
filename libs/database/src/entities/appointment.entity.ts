import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  VisitType,
  AppointmentType,
  AppointmentStatus,
  PaymentStatus,
} from './enums';
import { Tenant } from './tenant.entity';
import { Patient } from './patient.entity';
import { User } from './user.entity';
import { DoctorSlot } from './doctor-slot.entity';
import { Department } from './department.entity';

@Entity('appointments')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'doctorId', 'status'])
@Index(['tenantId', 'departmentId', 'status'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @Column({ name: 'slot_id', nullable: true })
  slotId: string | null;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string | null;

  @Column({
    name: 'visit_type',
    type: 'enum',
    enum: VisitType,
    default: VisitType.OPD,
  })
  visitType: VisitType;

  @Column({
    name: 'appointment_type',
    type: 'enum',
    enum: AppointmentType,
    default: AppointmentType.IN_PERSON,
  })
  appointmentType: AppointmentType;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.REGISTERED,
  })
  status: AppointmentStatus;

  @Column({ name: 'chief_complaint', nullable: true })
  chiefComplaint: string | null;

  @Column({ name: 'referred_by', nullable: true })
  referredBy: string | null;

  @Column({ name: 'opinion_obtained_by', nullable: true })
  opinionObtainedBy: string | null;

  @Column({ name: 'token_number', type: 'int', nullable: true })
  tokenNumber: number | null;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({
    name: 'payment_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  paymentAmount: string | null;

  @Column({ name: 'razorpay_order_id', nullable: true })
  razorpayOrderId: string | null;

  @Column({ name: 'razorpay_payment_id', nullable: true })
  razorpayPaymentId: string | null;

  @Column({
    name: 'registered_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  registeredAt: Date;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'pharmacy_sent_at', type: 'timestamptz', nullable: true })
  pharmacySentAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', nullable: true })
  cancellationReason: string | null;

  @Column({
    name: 'confirmation_24h_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  confirmation24hSentAt: Date | null;

  @Column({ name: 'reminder_1h_sent_at', type: 'timestamptz', nullable: true })
  reminder1hSentAt: Date | null;

  @Column({ nullable: true })
  notes: string | null;

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
  @JoinColumn({ name: 'doctor_id' })
  doctor: User;

  @ManyToOne(() => DoctorSlot, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'slot_id' })
  slot: DoctorSlot | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @OneToOne('Consultation', 'appointment', { cascade: false, eager: false })
  consultation: any;

  @OneToOne('PharmacyOrder', 'appointment', { cascade: false, eager: false })
  pharmacyOrder: any;

  @OneToOne('IPDAdmission', 'appointment', { cascade: false, eager: false })
  ipdAdmission: any;

  @OneToMany('Invoice', 'appointment', { cascade: false, eager: false })
  invoices: any[];

  @OneToMany('LabOrder', 'appointment', { cascade: false, eager: false })
  labOrders: any[];
}

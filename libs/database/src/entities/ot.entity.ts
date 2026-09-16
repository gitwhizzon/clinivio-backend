import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  OTTheaterType,
  OTTheaterStatus,
  OTScheduleStatus,
  OTPriority,
  AnaesthesiaType,
} from './enums';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { Patient } from './patient.entity';

// ─── Operation Theater ────────────────────────────────────────────────────────

@Entity('ot_theaters')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
export class OTTheater {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({
    name: 'theater_type',
    type: 'enum',
    enum: OTTheaterType,
    default: OTTheaterType.GENERAL,
  })
  theaterType: OTTheaterType;

  @Column({
    type: 'enum',
    enum: OTTheaterStatus,
    default: OTTheaterStatus.AVAILABLE,
  })
  status: OTTheaterStatus;

  @Column({ nullable: true })
  floor: string | null;

  @Column({ nullable: true })
  notes: string | null;

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

// ─── OT Schedule ──────────────────────────────────────────────────────────────

@Entity('ot_schedules')
@Index(['tenantId'])
@Index(['tenantId', 'scheduledDate'])
@Index(['tenantId', 'theaterId'])
@Index(['tenantId', 'status'])
export class OTSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'theater_id' })
  theaterId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'surgeon_id' })
  surgeonId: string;

  @Column({ name: 'anaesthetist_id', nullable: true })
  anaesthetistId: string | null;

  /** Array of assisting doctor / nurse user IDs */
  @Column({ name: 'assistant_ids', type: 'jsonb', default: [] })
  assistantIds: string[];

  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate: string;

  /** HH:MM 24-hour format */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime: string;

  @Column({ name: 'estimated_duration_mins', type: 'int' })
  estimatedDurationMins: number;

  @Column({ name: 'actual_start_time', type: 'timestamptz', nullable: true })
  actualStartTime: Date | null;

  @Column({ name: 'actual_end_time', type: 'timestamptz', nullable: true })
  actualEndTime: Date | null;

  @Column({ name: 'procedure_name' })
  procedureName: string;

  @Column({ name: 'procedure_code', nullable: true })
  procedureCode: string | null;

  @Column({ name: 'diagnosis_notes', type: 'text', nullable: true })
  diagnosisNotes: string | null;

  @Column({
    type: 'enum',
    enum: OTScheduleStatus,
    default: OTScheduleStatus.SCHEDULED,
  })
  status: OTScheduleStatus;

  @Column({ type: 'enum', enum: OTPriority, default: OTPriority.ELECTIVE })
  priority: OTPriority;

  @Column({
    name: 'anaesthesia_type',
    type: 'enum',
    enum: AnaesthesiaType,
    nullable: true,
  })
  anaesthesiaType: AnaesthesiaType | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ name: 'ipd_admission_id', nullable: true })
  ipdAdmissionId: string | null;

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

  @ManyToOne('OTTheater', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'theater_id' })
  theater: OTTheater;

  @ManyToOne('Patient', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'patient_id' })
  patient: any;

  @ManyToOne('User', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'surgeon_id' })
  surgeon: any;

  @ManyToOne('User', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'anaesthetist_id' })
  anaesthetist: any;
}

// ─── OT Record ────────────────────────────────────────────────────────────────

@Entity('ot_records')
@Index(['tenantId'])
export class OTRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'schedule_id', unique: true })
  scheduleId: string;

  /** { consentSigned, fastingConfirmed, allergyChecked, ivAccessConfirmed, siteMarked } */
  @Column({ name: 'pre_op_checklist', type: 'jsonb', nullable: true })
  preOpChecklist: Record<string, boolean> | null;

  @Column({ name: 'anaesthesia_notes', type: 'text', nullable: true })
  anaesthesiaNotes: string | null;

  @Column({ name: 'intra_op_notes', type: 'text', nullable: true })
  intraOpNotes: string | null;

  @Column({ name: 'blood_loss_ml', type: 'int', nullable: true })
  bloodLossMl: number | null;

  @Column({ name: 'fluid_input_ml', type: 'int', nullable: true })
  fluidInputMl: number | null;

  @Column({ name: 'fluid_output_ml', type: 'int', nullable: true })
  fluidOutputMl: number | null;

  @Column({ type: 'text', nullable: true })
  specimens: string | null;

  /** [{ name, serialNo, lot }] */
  @Column({ type: 'jsonb', nullable: true })
  implants: any[] | null;

  @Column({ name: 'post_op_instructions', type: 'text', nullable: true })
  postOpInstructions: string | null;

  @Column({ name: 'post_op_diagnosis', nullable: true })
  postOpDiagnosis: string | null;

  @Column({ type: 'text', nullable: true })
  complications: string | null;

  @Column({ name: 'recorded_by_id', nullable: true })
  recordedById: string | null;

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

  @OneToOne('OTSchedule', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'schedule_id' })
  schedule: OTSchedule;

  @ManyToOne('User', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'recorded_by_id' })
  recordedBy: any;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Consultation } from './consultation.entity';

@Entity('prescriptions')
export class Prescription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'consultation_id' })
  consultationId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @Column({ nullable: true, type: 'text' })
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

  @ManyToOne(() => Consultation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation: Consultation;

  @OneToMany('PrescriptionItem', 'prescription', {
    cascade: true,
    eager: false,
  })
  items: any[];
}

@Entity('prescription_items')
export class PrescriptionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'prescription_id' })
  prescriptionId: string;

  @Column({ name: 'medicine_name' })
  medicineName: string;

  @Column({ name: 'generic_name', nullable: true })
  genericName: string | null;

  @Column()
  dosage: string;

  @Column()
  frequency: string;

  @Column()
  duration: string;

  @Column({ nullable: true })
  instructions: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'is_substitutable', default: true })
  isSubstitutable: boolean;

  @Column({ name: 'inventory_id', nullable: true })
  inventoryId: string | null;

  @ManyToOne(() => Prescription, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prescription_id' })
  prescription: Prescription;
}

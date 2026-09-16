import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Gender, Language } from './enums';
import { Tenant } from './tenant.entity';
import { PatientFamily } from './patient-family.entity';

@Entity('patients')
@Unique('tenant_patient_uhid_unique', ['tenantId', 'uhid'])
@Index(['tenantId', 'phone'])
@Index(['tenantId', 'familyId'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'family_id', nullable: true })
  familyId: string | null;

  @Column()
  uhid: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string | null;

  @Column()
  phone: string;

  @Column({ name: 'whatsapp_phone', nullable: true })
  whatsappPhone: string | null;

  @Column({ name: 'has_whatsapp', default: true })
  hasWhatsapp: boolean;

  @Column({ nullable: true })
  email: string | null;

  @Column({ type: 'date', nullable: true })
  dob: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ name: 'blood_group', nullable: true })
  bloodGroup: string | null;

  @Column({ name: 'abha_id', nullable: true })
  abhaId: string | null;

  @Column({ name: 'abha_address', nullable: true })
  abhaAddress: string | null;

  @Column({
    name: 'preferred_language',
    type: 'enum',
    enum: Language,
    default: Language.EN,
  })
  preferredLanguage: Language;

  @Column({ name: 'emergency_contact_name', nullable: true })
  emergencyContactName: string | null;

  @Column({ name: 'emergency_contact_phone', nullable: true })
  emergencyContactPhone: string | null;

  @Column({ nullable: true })
  address: string | null;

  @Column({ name: 'consent_given_at', type: 'timestamptz', nullable: true })
  consentGivenAt: Date | null;

  @Column({ name: 'consent_version', nullable: true })
  consentVersion: string | null;

  @Column({ name: 'conditions', type: 'simple-json', nullable: true })
  conditions: string[] | null;

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

  @ManyToOne(() => PatientFamily, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'family_id' })
  family: PatientFamily | null;
}

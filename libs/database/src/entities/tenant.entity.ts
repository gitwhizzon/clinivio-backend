import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SubscriptionTier } from './enums';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * URL-safe slug — uniquely identifies the tenant in subdomains and schema names.
   * e.g. "hansvl" → subdomain hansvl.clinivio.ai, schema tenant_hansvl
   * Auto-generated from name if not provided; must be lowercase alphanumeric + hyphens.
   * Nullable so synchronize can add this column to tenants tables that predate multi-tenancy.
   * Re-run the seed (or set a slug via PATCH /tenants/:id) to populate existing rows.
   */
  @Column({ unique: true, nullable: true })
  slug: string | null;

  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  city: string | null;

  @Column({ nullable: true })
  state: string | null;

  @Column({ name: 'state_code', nullable: true })
  stateCode: string | null;

  @Column({ nullable: true })
  pincode: string | null;

  @Column({ nullable: true })
  gstin: string | null;

  @Column({
    name: 'cgst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  cgstRate: string | null;

  @Column({
    name: 'sgst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  sgstRate: string | null;

  @Column({
    name: 'igst_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  igstRate: string | null;

  @Column({ name: 'drug_license_no', nullable: true })
  drugLicenseNo: string | null;

  @Column({ name: 'abha_hip_id', nullable: true })
  abhaHipId: string | null;

  @Column({ name: 'whatsapp_phone_number_id', nullable: true })
  whatsappPhoneNumberId: string | null;

  @Column({ name: 'waba_id', nullable: true })
  wabaId: string | null;

  @Column({
    name: 'subscription_tier',
    type: 'enum',
    enum: SubscriptionTier,
    default: SubscriptionTier.BASIC,
  })
  subscriptionTier: SubscriptionTier;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * When true, doctors can check in and start a consultation before the
   * consultation fee is paid — the patient pays at the end instead. The
   * appointment's paymentStatus stays PENDING throughout so billing/dashboard
   * screens still surface it as payment-pending. Opt-in per hospital; most
   * clients keep the hard pay-before-consult gate (default false).
   */
  @Column({ name: 'allow_consult_before_payment', default: false })
  allowConsultationBeforePayment: boolean;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  email: string | null;

  @Column({ nullable: true })
  website: string | null;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'registration_no', nullable: true })
  registrationNo: string | null;

  @Column({ nullable: true })
  tagline: string | null;

  @Column({ name: 'print_header', nullable: true })
  printHeader: string | null;

  @Column({ name: 'pharmacy_name', nullable: true })
  pharmacyName: string | null;

  @Column({ name: 'portal_url', nullable: true })
  portalUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

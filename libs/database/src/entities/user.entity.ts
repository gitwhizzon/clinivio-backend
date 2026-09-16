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
  Index,
  Unique,
} from 'typeorm';
import { Role } from './enums';
import { Tenant } from './tenant.entity';

@Entity('users')
@Unique('tenant_user_email_unique', ['tenantId', 'email'])
@Unique('tenant_staff_id_unique', ['tenantId', 'staffId'])
export class User {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  email: string;

  @Column({ name: 'staff_id', nullable: true })
  staffId: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({
    name: 'password_reset_token',
    nullable: true,
    type: 'varchar',
    length: 128,
  })
  passwordResetToken: string | null;

  @Column({
    name: 'password_reset_expiry',
    type: 'timestamptz',
    nullable: true,
  })
  passwordResetExpiry: Date | null;

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

  @OneToOne('DoctorProfile', 'user', { nullable: true })
  doctorProfile: any | null;

  @OneToOne('StaffProfile', 'user', { nullable: true })
  staffProfile: any | null;
}

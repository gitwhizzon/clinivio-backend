import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null for platform-level actions (super-admin) */
  @Column({ nullable: true })
  @Index()
  tenantId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userEmail: string;

  @Column({ nullable: true })
  userRole: string;

  /** PAYMENT | CREATE | UPDATE | DELETE | CANCEL | CHECK_IN | etc. */
  @Column()
  action: string;

  /** Appointment | Patient | Invoice | IpdAdmission | LabOrder | etc. */
  @Column()
  entityType: string;

  @Column({ nullable: true })
  entityId: string;

  /** Human-readable summary shown in audit trail UI */
  @Column({ nullable: true, length: 500 })
  description: string;

  /** State before the change (captured by explicit service calls) */
  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, any>;

  /** Request body / state after change */
  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, any>;

  /** Extra context: token number, invoice number, etc. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true, length: 50 })
  ipAddress: string;

  @Column({ default: true })
  success: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

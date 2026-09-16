import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { NotificationChannel, NotificationStatus } from "./enums";
import { Tenant } from "./tenant.entity";
import { Patient } from "./patient.entity";

@Entity("notification_logs")
export class NotificationLog {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column({ type: "enum", enum: NotificationChannel })
  channel: NotificationChannel;

  @Column({ name: "notification_type" })
  notificationType: string;

  @Column({ name: "template_id", nullable: true })
  templateId: string | null;

  @Column({ type: "jsonb" })
  payload: any;

  @Column({
    type: "enum",
    enum: NotificationStatus,
    default: NotificationStatus.QUEUED,
  })
  status: NotificationStatus;

  @Column({ nullable: true })
  wamid: string | null;

  @Column({ name: "sent_at", type: "timestamptz", nullable: true })
  sentAt: Date | null;

  @Column({ name: "delivered_at", type: "timestamptz", nullable: true })
  deliveredAt: Date | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt: Date | null;

  @Column({ name: "failure_reason", nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Patient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patient_id" })
  patient: Patient;
}

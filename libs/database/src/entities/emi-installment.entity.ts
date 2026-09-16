import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { EmiPlan } from "./emi-plan.entity";
import { EmiInstallmentStatus } from "./enums";

/**
 * One installment of an EmiPlan. installmentNumber 0 = the advance,
 * collected synchronously at plan creation and already PAID; 1..N are the
 * regular installments, PENDING until collected. Routing the advance through
 * this same table/status means every collection — advance or later
 * installment — goes through the identical "collect" code path, so
 * SUM(amountPaid WHERE status=PAID) always equals Invoice.amountPaid by
 * construction (see EmiService).
 */
@Entity("emi_installments")
export class EmiInstallment {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "emi_plan_id" })
  emiPlanId: string;

  @Column({ name: "installment_number", type: "int" })
  installmentNumber: number;

  @Column({ name: "due_date", type: "date" })
  dueDate: string;

  @Column({ name: "amount_due", type: "decimal", precision: 10, scale: 2 })
  amountDue: string;

  @Column({
    name: "amount_paid",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  amountPaid: string;

  @Column({
    type: "enum",
    enum: EmiInstallmentStatus,
    default: EmiInstallmentStatus.PENDING,
  })
  status: EmiInstallmentStatus;

  @Column({ name: "payment_method", nullable: true })
  paymentMethod: string | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({ name: "receipt_number", nullable: true })
  receiptNumber: string | null;

  @Column({ name: "collected_by_user_id", nullable: true })
  collectedByUserId: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => EmiPlan, (p) => p.installments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "emi_plan_id" })
  emiPlan: EmiPlan;
}

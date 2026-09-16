import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Invoice } from "./invoice.entity";

/**
 * One row per money-collection event against an Invoice — a full payment, a
 * partial payment, or an EMI installment. This is the single ledger every
 * revenue figure in the app (dashboard, daily report, EMI receipts) reads
 * from, so collections are never double-counted or missed the way the
 * disconnected LabOrder.amountPaid/paymentStatus pair can (see lab.entity.ts).
 */
@Entity("invoice_payments")
@Index(["tenantId", "paidAt"])
export class InvoicePayment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "invoice_id" })
  invoiceId: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: string;

  @Column({ name: "payment_method" })
  paymentMethod: string;

  @Column({ name: "paid_at", type: "timestamptz" })
  paidAt: Date;

  @Column({ name: "collected_by_user_id", nullable: true })
  collectedByUserId: string | null;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @ManyToOne(() => Tenant, {
    onDelete: "CASCADE",
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: "tenant_id" })
  tenant: Tenant;

  @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id" })
  invoice: Invoice;
}

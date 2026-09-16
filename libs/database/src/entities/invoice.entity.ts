import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { InvoiceType, PaymentStatus, DiscountType } from "./enums";
import { Tenant } from "./tenant.entity";
import { Patient } from "./patient.entity";
// Appointment imported lazily via string reference to avoid circular deps

@Entity("invoices")
export class Invoice {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column({ name: "appointment_id", nullable: true })
  appointmentId: string | null;

  @Column({ name: "ipd_admission_id", nullable: true })
  ipdAdmissionId: string | null;

  @Column({ name: "invoice_number" })
  invoiceNumber: string;

  @Column({ name: "invoice_date", type: "date", default: () => "CURRENT_DATE" })
  invoiceDate: string;

  @Column({ name: "invoice_type", type: "enum", enum: InvoiceType })
  invoiceType: InvoiceType;

  @Column({ name: "line_items", type: "jsonb" })
  lineItems: any;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  subtotal: string;

  @Column({
    name: "discount_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  discountAmount: string;

  /**
   * How the cashier entered the discount (percentage vs flat amount) — kept
   * alongside the resolved `discountAmount` (which stays the flat value used
   * in GST math) so the receipt/UI can show "10% off" instead of just the
   * resolved rupee figure. Both nullable: older invoices predate discounts.
   */
  @Column({
    name: "discount_type",
    type: "enum",
    enum: DiscountType,
    nullable: true,
  })
  discountType: DiscountType | null;

  @Column({
    name: "discount_value",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  discountValue: string | null;

  @Column({
    name: "taxable_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  taxableAmount: string;

  @Column({
    name: "cgst_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  cgstAmount: string;

  @Column({
    name: "sgst_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  sgstAmount: string;

  @Column({
    name: "igst_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  igstAmount: string;

  @Column({ name: "total_amount", type: "decimal", precision: 10, scale: 2 })
  totalAmount: string;

  @Column({
    name: "payment_status",
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  /**
   * Running total actually collected against this invoice and what's left.
   * Written transactionally alongside each InvoicePayment row — see
   * InvoicesService.confirmPayment(). `totalAmount` itself is never mutated
   * by a payment; only these two track collection progress.
   */
  @Column({
    name: "amount_paid",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  amountPaid: string;

  @Column({
    name: "balance_due",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  balanceDue: string;

  @Column({ name: "payment_method", nullable: true })
  paymentMethod: string | null;

  @Column({ name: "razorpay_order_id", nullable: true })
  razorpayOrderId: string | null;

  @Column({ name: "razorpay_payment_id", nullable: true })
  razorpayPaymentId: string | null;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt: Date | null;

  @Column({ name: "print_copy_url", nullable: true })
  printCopyUrl: string | null;

  @Column({ nullable: true })
  irn: string | null;

  @Column({ name: "pdf_s3_key", nullable: true })
  pdfS3Key: string | null;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

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

  @ManyToOne(() => Patient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "patient_id" })
  patient: Patient;

  @ManyToOne("Appointment", "invoices", {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "appointment_id" })
  appointment: any;

  @ManyToOne("IPDAdmission", "invoices", {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "ipd_admission_id" })
  ipdAdmission: any;
}

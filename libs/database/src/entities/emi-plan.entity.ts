import {
  Entity,
  Column,
  PrimaryColumn,
  Generated,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Tenant } from "./tenant.entity";
import { Patient } from "./patient.entity";
import { Invoice } from "./invoice.entity";
import { EmiInstallment } from "./emi-installment.entity";
import { EmiFrequency, EmiPlanStatus } from "./enums";

/**
 * An installment plan against one Invoice — advance collected at creation
 * (installment #0, see EmiInstallment) plus N regular installments. See
 * EmiInstallment for why the advance is modeled as installment #0 rather
 * than a separate field.
 */
@Entity("emi_plans")
export class EmiPlan {
  @PrimaryColumn({ type: "text" })
  @Generated("uuid")
  id: string;

  @Column({ name: "tenant_id" })
  tenantId: string;

  @Column({ name: "invoice_id" })
  invoiceId: string;

  @Column({ name: "patient_id" })
  patientId: string;

  @Column({ name: "total_amount", type: "decimal", precision: 10, scale: 2 })
  totalAmount: string;

  @Column({ name: "advance_amount", type: "decimal", precision: 10, scale: 2 })
  advanceAmount: string;

  @Column({ name: "number_of_installments", type: "int" })
  numberOfInstallments: number;

  @Column({
    name: "installment_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
  })
  installmentAmount: string;

  @Column({ type: "enum", enum: EmiFrequency, default: EmiFrequency.MONTHLY })
  frequency: EmiFrequency;

  @Column({ name: "start_date", type: "date" })
  startDate: string;

  @Column({ type: "enum", enum: EmiPlanStatus, default: EmiPlanStatus.ACTIVE })
  status: EmiPlanStatus;

  @Column({ nullable: true, type: "text" })
  notes: string | null;

  @Column({ name: "created_by_user_id", nullable: true })
  createdByUserId: string | null;

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

  @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id" })
  invoice: Invoice;

  @OneToMany(() => EmiInstallment, (i) => i.emiPlan)
  installments: EmiInstallment[];
}

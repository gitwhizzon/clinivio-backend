import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import {
  Appointment,
  EmiPlan,
  EmiInstallment,
  Invoice,
  InvoicePayment,
  EmiFrequency,
  EmiPlanStatus,
  EmiInstallmentStatus,
  PaymentStatus,
  InvoiceType,
  DiscountType,
  TenantEntityManager,
  In,
} from "@mediflow/database";

class EmiLineItemDto {
  @IsString() description: string;
  @IsNumber() amount: number;
}

export class CreateEmiPlanDto {
  // Either invoiceId (invoice already exists, e.g. an IPD admission bill),
  // or appointmentId + lineItems to bill a fresh OPD consultation straight
  // into an EMI plan without a separate "create invoice, then EMI" step.
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() appointmentId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmiLineItemDto)
  lineItems?: EmiLineItemDto[];

  @IsOptional() @IsEnum(DiscountType) discountType?: DiscountType;
  @IsOptional() @IsNumber() discountValue?: number;
  @IsNumber() advanceAmount: number;
  @IsNumber() @IsPositive() numberOfInstallments: number;
  @IsOptional() @IsEnum(EmiFrequency) frequency?: EmiFrequency;
  @IsDateString() startDate: string;
  @IsString() paymentMethod: string;
  @IsOptional() @IsString() notes?: string;
}

export class CollectInstallmentDto {
  @IsString() paymentMethod: string;
  @IsOptional() @IsNumber() amount?: number;
}

export class CancelEmiPlanDto {
  @IsOptional() @IsString() reason?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class EmiService {
  constructor(private readonly db: TenantEntityManager) {}

  private async generateReceiptNumber(tenantId: string): Promise<string> {
    const count = await this.db
      .repo(EmiInstallment)
      .count({ where: { tenantId } });
    return `EMI-RCP-${String(count + 1).padStart(6, "0")}`;
  }

  private addPeriod(date: Date, frequency: EmiFrequency): Date {
    const d = new Date(date);
    if (frequency === EmiFrequency.WEEKLY) {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    return d;
  }

  async createPlan(
    tenantId: string,
    dto: CreateEmiPlanDto,
    collectedByUserId?: string,
  ) {
    if (dto.numberOfInstallments < 2) {
      throw new BadRequestException(
        "An EMI plan needs at least 2 installments",
      );
    }
    if (dto.advanceAmount < 0) {
      throw new BadRequestException("Advance amount cannot be negative");
    }
    if (!dto.invoiceId && !dto.appointmentId) {
      throw new BadRequestException(
        "Either invoiceId or appointmentId is required",
      );
    }

    const now = new Date();

    return this.db.transaction(async (em) => {
      const planRepo = em.getRepository(EmiPlan);
      const installmentRepo = em.getRepository(EmiInstallment);
      const invoiceRepo = em.getRepository(Invoice);
      const paymentRepo = em.getRepository(InvoicePayment);
      const appointmentRepo = em.getRepository(Appointment);

      // Resolve the invoice: reuse an existing one (invoiceId, e.g. an IPD
      // admission bill), reuse the appointment's existing CONSULTATION
      // invoice, or create a fresh one for a not-yet-billed OPD appointment -
      // same pattern AppointmentsService.confirmPayment() uses.
      let invoice: Invoice | null = null;
      if (dto.invoiceId) {
        invoice = await invoiceRepo.findOne({
          where: { id: dto.invoiceId, tenantId },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
      } else {
        const appointment = await appointmentRepo.findOne({
          where: { id: dto.appointmentId, tenantId },
        });
        if (!appointment) throw new NotFoundException("Appointment not found");

        invoice = await invoiceRepo.findOne({
          where: {
            appointmentId: dto.appointmentId,
            tenantId,
            invoiceType: InvoiceType.CONSULTATION,
          },
        });
        if (!invoice) {
          const lineItems = dto.lineItems?.length
            ? dto.lineItems
            : [{ description: "Consultation Fee", amount: dto.advanceAmount }];
          const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
          const discountAmount =
            !dto.discountType || dto.discountValue === undefined
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    dto.discountType === DiscountType.PERCENTAGE
                      ? (subtotal * dto.discountValue) / 100
                      : dto.discountValue,
                    subtotal,
                  ),
                );
          const totalAmount = Math.max(0, r2(subtotal - discountAmount));
          const invoiceCount = await invoiceRepo.count({ where: { tenantId } });
          const invoiceNumber = `INV-OPD-${String(invoiceCount + 1).padStart(6, "0")}`;
          invoice = await invoiceRepo.save(
            invoiceRepo.create({
              tenantId,
              patientId: appointment.patientId,
              appointmentId: dto.appointmentId,
              invoiceNumber,
              invoiceType: InvoiceType.CONSULTATION,
              lineItems,
              subtotal: String(subtotal),
              discountAmount: String(discountAmount),
              discountType: dto.discountType ?? null,
              discountValue:
                dto.discountValue !== undefined
                  ? String(dto.discountValue)
                  : null,
              taxableAmount: String(totalAmount),
              cgstAmount: "0",
              sgstAmount: "0",
              igstAmount: "0",
              totalAmount: String(totalAmount),
              amountPaid: "0",
              balanceDue: String(totalAmount),
              paymentStatus: PaymentStatus.PENDING,
            }),
          );
        }
      }

      if (
        ![PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID].includes(
          invoice.paymentStatus,
        )
      ) {
        throw new BadRequestException(
          "Invoice is not eligible for an EMI plan (already paid/refunded)",
        );
      }

      const existingActive = await planRepo.findOne({
        where: {
          invoiceId: invoice.id,
          tenantId,
          status: EmiPlanStatus.ACTIVE,
        },
      });
      if (existingActive) {
        throw new BadRequestException(
          "This invoice already has an active EMI plan",
        );
      }

      const balanceDue =
        parseFloat(invoice.balanceDue) > 0
          ? parseFloat(invoice.balanceDue)
          : parseFloat(invoice.totalAmount) -
            parseFloat(invoice.amountPaid ?? "0");
      if (dto.advanceAmount >= balanceDue) {
        throw new BadRequestException(
          "Advance amount covers the full balance - use a regular payment instead of an EMI plan",
        );
      }

      const frequency = dto.frequency ?? EmiFrequency.MONTHLY;
      const remaining = r2(balanceDue - dto.advanceAmount);
      const installmentAmount = r2(remaining / dto.numberOfInstallments);

      const plan = await planRepo.save(
        planRepo.create({
          tenantId,
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          totalAmount: String(balanceDue),
          advanceAmount: String(dto.advanceAmount),
          numberOfInstallments: dto.numberOfInstallments,
          installmentAmount: String(installmentAmount),
          frequency,
          startDate: dto.startDate,
          status: EmiPlanStatus.ACTIVE,
          notes: dto.notes ?? null,
          createdByUserId: collectedByUserId ?? null,
        }),
      );

      // Installment #0 = the advance, collected synchronously right now.
      const receiptNumber = await this.generateReceiptNumber(tenantId);
      await installmentRepo.save(
        installmentRepo.create({
          tenantId,
          emiPlanId: plan.id,
          installmentNumber: 0,
          dueDate: now.toISOString().split("T")[0],
          amountDue: String(dto.advanceAmount),
          amountPaid: String(dto.advanceAmount),
          status: EmiInstallmentStatus.PAID,
          paymentMethod: dto.paymentMethod,
          paidAt: now,
          receiptNumber,
          collectedByUserId: collectedByUserId ?? null,
        }),
      );

      // Remaining installments, spread out from startDate by frequency.
      let dueDate = new Date(dto.startDate);
      const rows: EmiInstallment[] = [];
      for (let i = 1; i <= dto.numberOfInstallments; i++) {
        // Last installment absorbs any rounding remainder.
        const amount =
          i === dto.numberOfInstallments
            ? r2(remaining - installmentAmount * (dto.numberOfInstallments - 1))
            : installmentAmount;
        rows.push(
          installmentRepo.create({
            tenantId,
            emiPlanId: plan.id,
            installmentNumber: i,
            dueDate: dueDate.toISOString().split("T")[0],
            amountDue: String(amount),
            amountPaid: "0",
            status: EmiInstallmentStatus.PENDING,
          }),
        );
        dueDate = this.addPeriod(dueDate, frequency);
      }
      await installmentRepo.save(rows);

      // Update the invoice with the advance collection.
      const newAmountPaid = r2(
        parseFloat(invoice.amountPaid ?? "0") + dto.advanceAmount,
      );
      const newBalanceDue = r2(balanceDue - dto.advanceAmount);
      await invoiceRepo.update(invoice.id, {
        paymentStatus: PaymentStatus.PARTIALLY_PAID,
        paymentMethod: dto.paymentMethod,
        amountPaid: String(newAmountPaid),
        balanceDue: String(newBalanceDue),
        paidAt: now,
      });
      await paymentRepo.save(
        paymentRepo.create({
          tenantId,
          invoiceId: invoice.id,
          amount: String(dto.advanceAmount),
          paymentMethod: dto.paymentMethod,
          paidAt: now,
          collectedByUserId: collectedByUserId ?? null,
        }),
      );

      // Keep Appointment.paymentStatus/paymentAmount in sync, same as
      // AppointmentsService.confirmPayment() does for regular payments.
      if (invoice.appointmentId) {
        await appointmentRepo.update(invoice.appointmentId, {
          paymentStatus: PaymentStatus.PARTIALLY_PAID,
          paymentAmount: String(newAmountPaid),
        });
      }

      return planRepo.findOne({
        where: { id: plan.id },
        relations: ["patient", "installments"],
      });
    });
  }

  async collectInstallment(
    tenantId: string,
    planId: string,
    installmentId: string,
    dto: CollectInstallmentDto,
    collectedByUserId?: string,
  ) {
    const plan = await this.db
      .repo(EmiPlan)
      .findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException("EMI plan not found");
    if (plan.status !== EmiPlanStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot collect on a ${plan.status.toLowerCase()} plan`,
      );
    }

    const installment = await this.db.repo(EmiInstallment).findOne({
      where: { id: installmentId, emiPlanId: planId, tenantId },
    });
    if (!installment) throw new NotFoundException("Installment not found");
    if (installment.status === EmiInstallmentStatus.PAID) {
      throw new BadRequestException("Installment already paid");
    }

    const amount = dto.amount ?? parseFloat(installment.amountDue);
    if (amount <= 0)
      throw new BadRequestException("Payment amount must be greater than zero");

    const now = new Date();
    const receiptNumber = await this.generateReceiptNumber(tenantId);

    return this.db.transaction(async (em) => {
      const installmentRepo = em.getRepository(EmiInstallment);
      const planRepo = em.getRepository(EmiPlan);
      const invoiceRepo = em.getRepository(Invoice);
      const paymentRepo = em.getRepository(InvoicePayment);
      const appointmentRepo = em.getRepository(Appointment);

      await installmentRepo.update(installment.id, {
        status: EmiInstallmentStatus.PAID,
        amountPaid: String(amount),
        paymentMethod: dto.paymentMethod,
        paidAt: now,
        receiptNumber,
        collectedByUserId: collectedByUserId ?? null,
      });

      const invoice = await invoiceRepo.findOne({
        where: { id: plan.invoiceId },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");

      const invoiceBalance = parseFloat(invoice.balanceDue);
      const collected = Math.min(amount, invoiceBalance);
      const newAmountPaid = r2(
        parseFloat(invoice.amountPaid ?? "0") + collected,
      );
      const newBalanceDue = Math.max(0, r2(invoiceBalance - collected));
      const invoiceNowPaid = newBalanceDue <= 0.005;

      await invoiceRepo.update(invoice.id, {
        paymentStatus: invoiceNowPaid
          ? PaymentStatus.PAID
          : PaymentStatus.PARTIALLY_PAID,
        paymentMethod: dto.paymentMethod,
        amountPaid: String(newAmountPaid),
        balanceDue: String(newBalanceDue),
        paidAt: now,
      });
      await paymentRepo.save(
        paymentRepo.create({
          tenantId,
          invoiceId: invoice.id,
          amount: String(collected),
          paymentMethod: dto.paymentMethod,
          paidAt: now,
          collectedByUserId: collectedByUserId ?? null,
        }),
      );

      if (invoiceNowPaid) {
        await planRepo.update(plan.id, { status: EmiPlanStatus.COMPLETED });
      }

      if (invoice.appointmentId) {
        await appointmentRepo.update(invoice.appointmentId, {
          paymentStatus: invoiceNowPaid
            ? PaymentStatus.PAID
            : PaymentStatus.PARTIALLY_PAID,
          paymentAmount: String(newAmountPaid),
        });
      }

      return installmentRepo.findOne({ where: { id: installment.id } });
    });
  }

  async findActivePlans(tenantId: string) {
    return this.db.repo(EmiPlan).find({
      where: { tenantId, status: EmiPlanStatus.ACTIVE },
      relations: ["patient", "installments"],
      order: { createdAt: "DESC" },
    });
  }

  async findHistory(tenantId: string) {
    return this.db.repo(EmiPlan).find({
      where: {
        tenantId,
        status: In([EmiPlanStatus.COMPLETED, EmiPlanStatus.CANCELLED]),
      },
      relations: ["patient", "installments"],
      order: { updatedAt: "DESC" },
    });
  }

  async findPlanById(tenantId: string, id: string) {
    const plan = await this.db.repo(EmiPlan).findOne({
      where: { id, tenantId },
      relations: ["patient", "installments", "invoice"],
    });
    if (!plan) throw new NotFoundException("EMI plan not found");
    return plan;
  }

  async cancelPlan(tenantId: string, id: string, dto: CancelEmiPlanDto) {
    const plan = await this.findPlanById(tenantId, id);
    if (plan.status !== EmiPlanStatus.ACTIVE) {
      throw new BadRequestException(
        `Plan is already ${plan.status.toLowerCase()}`,
      );
    }
    // No automatic refund of already-collected installments - matches the
    // existing appointment-cancel precedent (cancellation never auto-refunds).
    await this.db.repo(EmiPlan).update(id, {
      status: EmiPlanStatus.CANCELLED,
      notes: dto.reason
        ? `${plan.notes ?? ""}\nCancelled: ${dto.reason}`.trim()
        : plan.notes,
    });
    return this.findPlanById(tenantId, id);
  }
}

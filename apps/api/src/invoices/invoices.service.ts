import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Invoice,
  InvoicePayment,
  Patient,
  InvoiceType,
  PaymentStatus,
  DiscountType,
  TenantEntityManager,
} from '@mediflow/database';

interface LineItem {
  name: string;
  quantity?: number;
  unitPrice: number;
  gstPercent?: number;
  discount?: number;
}

// Invoice types eligible for partial payment / EMI. PHARMACY invoices are
// created already-PAID at dispense time; LAB billing runs through its own
// LabOrder.amountDue/amountPaid mechanism (a known separate/disconnected
// path, out of scope here) — neither should be told a partial payment is OK.
const PARTIAL_PAYMENT_INVOICE_TYPES: InvoiceType[] = [
  InvoiceType.CONSULTATION,
  InvoiceType.PACKAGE,
  InvoiceType.PROCEDURE,
];

export class CreateInvoiceDto {
  patientId: string;
  appointmentId?: string;
  ipdAdmissionId?: string;
  invoiceType: InvoiceType;
  lineItems: LineItem[];
  discountAmount?: number;
  discountType?: DiscountType;
  discountValue?: number;
  notes?: string;
  useIGST?: boolean;
}

export class ConfirmPaymentDto {
  paymentMethod: string;
  amount?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}

const DEFAULT_GST_RATE = 0;

interface GSTCalculation {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

// Resolves a cashier-entered discount (percentage or flat) against the
// pre-discount subtotal into a flat rupee amount, clamped to [0, subtotal]
// so a bad percentage/value can't push the invoice negative.
function resolveDiscountAmount(
  lineItems: LineItem[],
  discountType?: DiscountType,
  discountValue?: number,
): number {
  if (!discountType || discountValue === undefined || discountValue === null)
    return 0;
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.unitPrice * (item.quantity ?? 1),
    0,
  );
  const raw =
    discountType === DiscountType.PERCENTAGE
      ? (subtotal * discountValue) / 100
      : discountValue;
  return Math.max(0, Math.min(raw, subtotal));
}

function calculateGST(
  lineItems: LineItem[],
  discountAmount: number,
  useIGST: boolean,
): GSTCalculation {
  let subtotal = 0;
  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  for (const item of lineItems) {
    const qty = item.quantity ?? 1;
    const basePrice = item.unitPrice * qty;
    const itemDiscount = item.discount ?? 0;
    const taxable = basePrice - itemDiscount;
    const gstRate = item.gstPercent ?? DEFAULT_GST_RATE;

    subtotal += basePrice;

    if (useIGST) {
      totalIGST += (taxable * gstRate) / 100;
    } else {
      totalCGST += (taxable * gstRate) / 2 / 100;
      totalSGST += (taxable * gstRate) / 2 / 100;
    }

    totalTaxable += taxable;
  }

  totalTaxable = Math.max(0, totalTaxable - discountAmount);
  const totalAmount = totalTaxable + totalCGST + totalSGST + totalIGST;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxableAmount: Math.round(totalTaxable * 100) / 100,
    cgstAmount: Math.round(totalCGST * 100) / 100,
    sgstAmount: Math.round(totalSGST * 100) / 100,
    igstAmount: Math.round(totalIGST * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

@Injectable()
export class InvoicesService {
  constructor(private readonly db: TenantEntityManager) {}

  private async generateInvoiceNumber(
    tenantId: string,
    type: InvoiceType,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.db
      .repo(Invoice)
      .count({ where: { tenantId, invoiceType: type } });
    const prefix = type.slice(0, 3).toUpperCase();
    return `INV-${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  async create(tenantId: string, dto: CreateInvoiceDto) {
    const patient = await this.db
      .repo(Patient)
      .findOne({ where: { id: dto.patientId, tenantId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const discountAmount = dto.discountType
      ? resolveDiscountAmount(
          dto.lineItems,
          dto.discountType,
          dto.discountValue,
        )
      : (dto.discountAmount ?? 0);
    const gst = calculateGST(
      dto.lineItems,
      discountAmount,
      dto.useIGST ?? false,
    );
    const invoiceNumber = await this.generateInvoiceNumber(
      tenantId,
      dto.invoiceType,
    );

    const invoice = await this.db.repo(Invoice).save(
      this.db.repo(Invoice).create({
        tenantId,
        patientId: dto.patientId,
        appointmentId: dto.appointmentId ?? null,
        ipdAdmissionId: dto.ipdAdmissionId ?? null,
        invoiceNumber,
        invoiceDate: new Date().toISOString().split('T')[0],
        invoiceType: dto.invoiceType,
        lineItems: dto.lineItems,
        subtotal: String(gst.subtotal),
        discountAmount: String(gst.discountAmount),
        discountType: dto.discountType ?? null,
        discountValue:
          dto.discountValue !== undefined ? String(dto.discountValue) : null,
        taxableAmount: String(gst.taxableAmount),
        cgstAmount: String(gst.cgstAmount),
        sgstAmount: String(gst.sgstAmount),
        igstAmount: String(gst.igstAmount),
        totalAmount: String(gst.totalAmount),
        amountPaid: '0',
        balanceDue: String(gst.totalAmount),
        paymentStatus: PaymentStatus.PENDING,
        notes: dto.notes ?? null,
      }),
    );

    return this.db
      .repo(Invoice)
      .findOne({ where: { id: invoice.id }, relations: ['patient'] });
  }

  async findAll(
    tenantId: string,
    filters: {
      patientId?: string;
      invoiceType?: InvoiceType;
      paymentStatus?: PaymentStatus;
      from?: string;
      to?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const qb = this.db
      .qb(Invoice, 'inv')
      .leftJoinAndSelect('inv.patient', 'patient')
      .where('inv.tenantId = :tenantId', { tenantId });

    if (filters.patientId)
      qb.andWhere('inv.patientId = :patientId', {
        patientId: filters.patientId,
      });
    if (filters.invoiceType)
      qb.andWhere('inv.invoiceType = :invoiceType', {
        invoiceType: filters.invoiceType,
      });
    if (filters.paymentStatus)
      qb.andWhere('inv.paymentStatus = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    if (filters.from)
      qb.andWhere('inv.createdAt >= :from', { from: new Date(filters.from) });
    if (filters.to)
      qb.andWhere('inv.createdAt <= :to', { to: new Date(filters.to) });

    qb.orderBy('inv.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, tenantId: string) {
    const invoice = await this.db
      .repo(Invoice)
      .findOne({ where: { id, tenantId }, relations: ['patient'] });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async confirmPayment(
    id: string,
    tenantId: string,
    dto: ConfirmPaymentDto,
    collectedByUserId?: string,
  ) {
    const invoice = await this.findById(id, tenantId);
    if (invoice.paymentStatus === PaymentStatus.PAID)
      throw new BadRequestException('Invoice already paid');
    if (invoice.paymentStatus === PaymentStatus.REFUNDED)
      throw new BadRequestException('Cannot pay a refunded invoice');

    // balanceDue predates this column on older rows (default '0') — fall back
    // to totalAmount minus whatever's already recorded as paid.
    const balanceDue =
      invoice.balanceDue !== null &&
      invoice.balanceDue !== undefined &&
      parseFloat(invoice.balanceDue) > 0
        ? parseFloat(invoice.balanceDue)
        : parseFloat(invoice.totalAmount) -
          parseFloat(invoice.amountPaid ?? '0');
    const requested = dto.amount !== undefined ? dto.amount : balanceDue;
    if (requested <= 0)
      throw new BadRequestException('Payment amount must be greater than zero');

    // Never collect more than what's owed — extra gets silently ignored
    // rather than pushing balanceDue negative.
    const collected = Math.min(requested, balanceDue);
    const isPartial = collected < balanceDue - 0.005;
    if (
      isPartial &&
      !PARTIAL_PAYMENT_INVOICE_TYPES.includes(invoice.invoiceType)
    ) {
      throw new BadRequestException(
        `Partial payment is not supported for ${invoice.invoiceType} invoices`,
      );
    }

    const now = new Date();
    const newAmountPaid =
      Math.round((parseFloat(invoice.amountPaid ?? '0') + collected) * 100) /
      100;
    const newBalanceDue = Math.max(
      0,
      Math.round((balanceDue - collected) * 100) / 100,
    );
    const newStatus =
      newBalanceDue <= 0.005
        ? PaymentStatus.PAID
        : PaymentStatus.PARTIALLY_PAID;

    return this.db.transaction(async (em) => {
      await em.getRepository(Invoice).update(id, {
        paymentStatus: newStatus,
        paymentMethod: dto.paymentMethod,
        razorpayOrderId: dto.razorpayOrderId ?? null,
        razorpayPaymentId: dto.razorpayPaymentId ?? null,
        amountPaid: String(newAmountPaid),
        balanceDue: String(newBalanceDue),
        paidAt: now,
      });
      await em.getRepository(InvoicePayment).save(
        em.getRepository(InvoicePayment).create({
          tenantId,
          invoiceId: id,
          amount: String(Math.round(collected * 100) / 100),
          paymentMethod: dto.paymentMethod,
          paidAt: now,
          collectedByUserId: collectedByUserId ?? null,
        }),
      );
      return em
        .getRepository(Invoice)
        .findOne({ where: { id }, relations: ['patient'] });
    });
  }

  async refund(id: string, tenantId: string) {
    const invoice = await this.findById(id, tenantId);
    if (invoice.paymentStatus !== PaymentStatus.PAID)
      throw new BadRequestException('Only paid invoices can be refunded');
    await this.db
      .repo(Invoice)
      .update(id, { paymentStatus: PaymentStatus.REFUNDED });
    return this.findById(id, tenantId);
  }

  async getPatientInvoices(patientId: string, tenantId: string) {
    return this.db
      .repo(Invoice)
      .find({ where: { patientId, tenantId }, order: { createdAt: 'DESC' } });
  }

  async getInvoicesByAppointment(appointmentId: string, tenantId: string) {
    return this.db.repo(Invoice).find({
      where: { appointmentId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInvoicesByAdmission(ipdAdmissionId: string, tenantId: string) {
    return this.db.repo(Invoice).find({
      where: { ipdAdmissionId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}

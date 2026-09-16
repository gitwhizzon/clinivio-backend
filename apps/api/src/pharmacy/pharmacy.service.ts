import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  PharmacyOrder,
  PharmacyInventory,
  PharmacyPurchase,
  PharmacyPurchaseItem,
  Appointment,
  Invoice,
  InvoicePayment,
  Patient,
  Tenant,
  PharmacyOrderStatus,
  InvoiceType,
  PaymentStatus,
  TenantEntityManager,
  ILike,
  LessThanOrEqual,
} from "@mediflow/database";

export class CreateInventoryItemDto {
  name: string;
  genericName?: string;
  category?: string;
  unit?: string;
  stockQty?: number;
  reorderLevel?: number;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  sellingPrice?: number;
  gstRate?: number;
  manufacturer?: string;
  hsn?: string;
}

export class UpdateInventoryItemDto {
  name?: string;
  genericName?: string;
  category?: string;
  unit?: string;
  stockQty?: number;
  reorderLevel?: number;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  sellingPrice?: number;
  gstRate?: number;
  manufacturer?: string;
  hsn?: string;
  isActive?: boolean;
}

export class UpdatePharmacyOrderDto {
  status?: PharmacyOrderStatus;
  dispenserNotes?: string;
}

export class DispenseItemDto {
  inventoryId: string;
  quantity: number;
}

export class DispenseOrderDto {
  items: DispenseItemDto[];
  paymentMethod: "CASH" | "CARD" | "UPI" | "ONLINE";
  dispenserNotes?: string;
}

export class CreatePurchaseItemDto {
  inventoryId?: string;
  medicineName: string;
  batchNo?: string;
  expiryDate?: string;
  quantity: number;
  freeQty?: number;
  purchasePrice: number;
  mrp?: number;
  sellingPrice?: number;
  discountPercent?: number;
  gstRate?: number;
}

export class CreatePurchaseDto {
  vendorName: string;
  invoiceNo?: string;
  purchaseDate: string;
  notes?: string;
  items: CreatePurchaseItemDto[];
}

@Injectable()
export class PharmacyService {
  constructor(
    private readonly db: TenantEntityManager,
    @InjectDataSource() private readonly platformDs: DataSource,
  ) {}

  async findAll(
    tenantId: string,
    filters: { status?: PharmacyOrderStatus; from?: string; to?: string },
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const qb = this.db
      .qb(PharmacyOrder, "po")
      .leftJoinAndSelect("po.patient", "patient")
      .leftJoinAndSelect("po.appointment", "appointment")
      .leftJoinAndSelect("appointment.doctor", "doctor")
      .leftJoinAndSelect("appointment.department", "department")
      .leftJoinAndSelect("appointment.consultation", "consultation")
      .leftJoinAndSelect("consultation.prescriptions", "prescriptions")
      .leftJoinAndSelect("prescriptions.items", "items")
      .where("po.tenantId = :tenantId", { tenantId });

    if (filters.status)
      qb.andWhere("po.status = :status", { status: filters.status });
    if (filters.from)
      qb.andWhere("po.createdAt >= :from", { from: new Date(filters.from) });
    if (filters.to)
      qb.andWhere("po.createdAt <= :to", { to: new Date(filters.to) });

    qb.orderBy("po.createdAt", "DESC").skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOrderById(id: string, tenantId: string) {
    const order = await this.db
      .qb(PharmacyOrder, "po")
      .leftJoinAndSelect("po.patient", "patient")
      .leftJoinAndSelect("po.appointment", "appointment")
      .leftJoinAndSelect("appointment.doctor", "doctor")
      .leftJoinAndSelect("appointment.department", "department")
      .leftJoinAndSelect("appointment.consultation", "consultation")
      .leftJoinAndSelect("consultation.prescriptions", "prescriptions")
      .leftJoinAndSelect("prescriptions.items", "items")
      .where("po.id = :id", { id })
      .andWhere("po.tenantId = :tenantId", { tenantId })
      .getOne();

    if (!order) throw new NotFoundException("Pharmacy order not found");
    return order;
  }

  async updateOrder(id: string, tenantId: string, dto: UpdatePharmacyOrderDto) {
    const order = await this.db
      .repo(PharmacyOrder)
      .findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException("Pharmacy order not found");

    const now = new Date();
    const updates: Partial<PharmacyOrder> = {};
    if (dto.status) updates.status = dto.status;
    if (dto.dispenserNotes !== undefined)
      updates.dispenserNotes = dto.dispenserNotes;
    if (dto.status === PharmacyOrderStatus.DISPENSED) updates.dispensedAt = now;

    await this.db.repo(PharmacyOrder).update(id, updates);

    // When dispensed, create a PHARMACY invoice so revenue stats reflect the sale
    if (dto.status === PharmacyOrderStatus.DISPENSED) {
      const existing = await this.db.repo(Invoice).findOne({
        where: {
          appointmentId: order.appointmentId,
          tenantId,
          invoiceType: InvoiceType.PHARMACY,
        },
      });
      if (!existing) {
        const tenant = await this.platformDs.getRepository(Tenant).findOne({
          where: { id: tenantId },
          select: ["id", "cgstRate", "sgstRate"],
        });
        const defaultCgst =
          tenant?.cgstRate !== null && tenant?.cgstRate !== undefined
            ? parseFloat(tenant.cgstRate)
            : parseFloat(process.env.GST_CGST_RATE ?? "0.09") * 100;
        const defaultSgst =
          tenant?.sgstRate !== null && tenant?.sgstRate !== undefined
            ? parseFloat(tenant.sgstRate)
            : parseFloat(process.env.GST_SGST_RATE ?? "0.09") * 100;

        const r2 = (n: number) => Math.round(n * 100) / 100;
        let subtotal = 0,
          totalCgst = 0,
          totalSgst = 0;
        const lineItems: any[] = [];

        try {
          const appt = await this.db.repo(Appointment).findOne({
            where: { id: order.appointmentId, tenantId },
            relations: [
              "consultation",
              "consultation.prescriptions",
              "consultation.prescriptions.items",
            ],
          });
          const prescItems =
            appt?.consultation?.prescriptions?.[0]?.items ?? [];
          for (const item of prescItems) {
            const inv = await this.db.repo(PharmacyInventory).findOne({
              where: {
                tenantId,
                name: ILike(item.medicineName),
                isActive: true,
              },
            });
            if (inv) {
              const price = parseFloat(inv.sellingPrice) * (item.quantity || 1);
              const gstTotal =
                inv.gstRate !== null
                  ? parseFloat(inv.gstRate)
                  : defaultCgst + defaultSgst;
              subtotal += price;
              totalCgst += (price * gstTotal) / 2 / 100;
              totalSgst += (price * gstTotal) / 2 / 100;
              lineItems.push({
                name: item.medicineName,
                unitPrice: parseFloat(inv.sellingPrice),
                quantity: item.quantity || 1,
                gstPercent: gstTotal,
              });
            }
          }
        } catch {
          /* ignore — use 0 if price lookup fails */
        }

        if (!lineItems.length) {
          lineItems.push({ description: "Pharmacy Dispensing", amount: 0 });
        }

        const totalAmount = r2(subtotal + totalCgst + totalSgst);
        const invoiceCount = await this.db
          .repo(Invoice)
          .count({ where: { tenantId } });
        const invoiceNumber = `INV-PHR-${String(invoiceCount + 1).padStart(6, "0")}`;
        const savedInvoice = await this.db.repo(Invoice).save(
          this.db.repo(Invoice).create({
            tenantId,
            patientId: order.patientId,
            appointmentId: order.appointmentId,
            invoiceNumber,
            invoiceType: InvoiceType.PHARMACY,
            lineItems,
            subtotal: String(r2(subtotal)),
            discountAmount: "0",
            taxableAmount: String(r2(subtotal)),
            cgstAmount: String(r2(totalCgst)),
            sgstAmount: String(r2(totalSgst)),
            igstAmount: "0",
            totalAmount: String(totalAmount),
            amountPaid: String(totalAmount),
            balanceDue: "0",
            paymentStatus: PaymentStatus.PAID,
            paidAt: now,
          }),
        );
        // Pharmacy sales are recorded paid-in-full at dispense time, not via
        // InvoicesService/AppointmentsService confirmPayment() — write the
        // matching ledger row directly so revenue stats (which read off
        // InvoicePayment) still see this sale.
        await this.db.repo(InvoicePayment).save(
          this.db.repo(InvoicePayment).create({
            tenantId,
            invoiceId: savedInvoice.id,
            amount: String(totalAmount),
            paymentMethod: "CASH",
            paidAt: now,
          }),
        );
      }
    }

    return this.findOrderById(id, tenantId);
  }

  async listInventory(tenantId: string, q?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    let items: PharmacyInventory[];
    let total: number;

    if (q) {
      [items, total] = await this.db.repo(PharmacyInventory).findAndCount({
        where: [
          { tenantId, isActive: true, name: ILike(`%${q}%`) },
          { tenantId, isActive: true, genericName: ILike(`%${q}%`) },
          { tenantId, isActive: true, category: ILike(`%${q}%`) },
        ],
        order: { name: "ASC" },
        skip,
        take: limit,
      });
    } else {
      [items, total] = await this.db.repo(PharmacyInventory).findAndCount({
        where: { tenantId, isActive: true },
        order: { name: "ASC" },
        skip,
        take: limit,
      });
    }

    return {
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findInventoryItem(id: string, tenantId: string) {
    const item = await this.db
      .repo(PharmacyInventory)
      .findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException("Inventory item not found");
    return item;
  }

  async createInventoryItem(tenantId: string, dto: CreateInventoryItemDto) {
    return this.db.repo(PharmacyInventory).save(
      this.db.repo(PharmacyInventory).create({
        tenantId,
        name: dto.name,
        genericName: dto.genericName ?? null,
        category: dto.category ?? null,
        unit: dto.unit ?? "Tablet",
        stockQty: dto.stockQty ?? 0,
        reorderLevel: dto.reorderLevel ?? 10,
        batchNo: dto.batchNo ?? null,
        expiryDate: dto.expiryDate ?? null,
        mrp: dto.mrp !== undefined ? String(dto.mrp) : "0",
        sellingPrice:
          dto.sellingPrice !== undefined ? String(dto.sellingPrice) : "0",
        gstRate: dto.gstRate !== undefined ? String(dto.gstRate) : null,
        manufacturer: dto.manufacturer ?? null,
        hsn: dto.hsn ?? null,
        isActive: true,
      }),
    );
  }

  async updateInventoryItem(
    id: string,
    tenantId: string,
    dto: UpdateInventoryItemDto,
  ) {
    await this.findInventoryItem(id, tenantId);

    const updates: Partial<PharmacyInventory> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.genericName !== undefined) updates.genericName = dto.genericName;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.stockQty !== undefined) updates.stockQty = dto.stockQty;
    if (dto.reorderLevel !== undefined) updates.reorderLevel = dto.reorderLevel;
    if (dto.batchNo !== undefined) updates.batchNo = dto.batchNo;
    if (dto.expiryDate !== undefined) updates.expiryDate = dto.expiryDate;
    if (dto.mrp !== undefined) updates.mrp = String(dto.mrp);
    if (dto.sellingPrice !== undefined)
      updates.sellingPrice = String(dto.sellingPrice);
    if (dto.gstRate !== undefined) updates.gstRate = String(dto.gstRate);
    if (dto.manufacturer !== undefined) updates.manufacturer = dto.manufacturer;
    if (dto.hsn !== undefined) updates.hsn = dto.hsn;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    await this.db.repo(PharmacyInventory).update(id, updates);
    return this.db.repo(PharmacyInventory).findOne({ where: { id } });
  }

  async adjustStock(id: string, tenantId: string, delta: number) {
    const item = await this.findInventoryItem(id, tenantId);
    const newQty = item.stockQty + delta;
    if (newQty < 0) throw new BadRequestException("Insufficient stock");
    await this.db.repo(PharmacyInventory).update(id, { stockQty: newQty });
    return this.db.repo(PharmacyInventory).findOne({ where: { id } });
  }

  async getLowStockItems(tenantId: string) {
    return this.db
      .qb(PharmacyInventory, "inv")
      .where("inv.tenantId = :tenantId", { tenantId })
      .andWhere("inv.isActive = true")
      .andWhere("inv.stockQty <= inv.reorderLevel")
      .orderBy("inv.stockQty", "ASC")
      .getMany();
  }

  async getExpiringItems(tenantId: string, withinDays = 30) {
    const today = new Date().toISOString().split("T")[0];
    const future = new Date();
    future.setDate(future.getDate() + withinDays);
    const futureDate = future.toISOString().split("T")[0];

    return this.db
      .qb(PharmacyInventory, "inv")
      .where("inv.tenantId = :tenantId", { tenantId })
      .andWhere("inv.isActive = true")
      .andWhere("inv.expiryDate IS NOT NULL")
      .andWhere("inv.expiryDate >= :today", { today })
      .andWhere("inv.expiryDate <= :futureDate", { futureDate })
      .orderBy("inv.expiryDate", "ASC")
      .getMany();
  }

  async dispenseOrder(id: string, tenantId: string, dto: DispenseOrderDto) {
    const order = await this.db
      .repo(PharmacyOrder)
      .findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException("Pharmacy order not found");
    if (order.status === PharmacyOrderStatus.DISPENSED)
      throw new BadRequestException("Order is already dispensed");
    if (order.status === PharmacyOrderStatus.RETURNED)
      throw new BadRequestException("Cannot dispense a returned order");
    if (!dto.items?.length)
      throw new BadRequestException(
        "At least one item is required to dispense",
      );

    // Validate each inventory item and check stock
    const resolved: Array<{ inv: PharmacyInventory; quantity: number }> = [];
    for (const dtoItem of dto.items) {
      const inv = await this.db.repo(PharmacyInventory).findOne({
        where: { id: dtoItem.inventoryId, tenantId, isActive: true },
      });
      if (!inv)
        throw new BadRequestException(
          `Inventory item not found: ${dtoItem.inventoryId}`,
        );
      if (inv.stockQty < dtoItem.quantity)
        throw new BadRequestException(
          `Insufficient stock for "${inv.name}" — available: ${inv.stockQty}, requested: ${dtoItem.quantity}`,
        );
      resolved.push({ inv, quantity: dtoItem.quantity });
    }

    // Get tenant default GST rates for fallback
    const tenant = await this.platformDs.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: ["id", "cgstRate", "sgstRate"],
    });
    const envCgst = parseFloat(process.env.GST_CGST_RATE ?? "0.09") * 100;
    const envSgst = parseFloat(process.env.GST_SGST_RATE ?? "0.09") * 100;
    const defaultCgstPct =
      tenant?.cgstRate != null ? parseFloat(tenant.cgstRate) : envCgst;
    const defaultSgstPct =
      tenant?.sgstRate != null ? parseFloat(tenant.sgstRate) : envSgst;

    // Calculate amounts
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    const lineItems = resolved.map(({ inv, quantity }) => {
      const unitPrice = parseFloat(inv.sellingPrice);
      const lineTotal = unitPrice * quantity;
      const cgstPct =
        inv.gstRate != null ? parseFloat(inv.gstRate) / 2 : defaultCgstPct;
      const sgstPct =
        inv.gstRate != null ? parseFloat(inv.gstRate) / 2 : defaultSgstPct;
      subtotal += lineTotal;
      totalCgst += r2((lineTotal * cgstPct) / 100);
      totalSgst += r2((lineTotal * sgstPct) / 100);
      return {
        inventoryId: inv.id,
        name: inv.name,
        unit: inv.unit,
        quantity,
        unitPrice,
        cgstPct,
        sgstPct,
      };
    });
    const taxable = subtotal;
    const totalAmount = r2(taxable + totalCgst + totalSgst);

    const now = new Date();

    // Deduct stock for each item
    await Promise.all(
      resolved.map(({ inv, quantity }) =>
        this.db
          .repo(PharmacyInventory)
          .update(inv.id, { stockQty: inv.stockQty - quantity }),
      ),
    );

    // Upsert pharmacy invoice
    const existing = await this.db.repo(Invoice).findOne({
      where: {
        appointmentId: order.appointmentId,
        tenantId,
        invoiceType: InvoiceType.PHARMACY,
      },
    });
    const invoiceCount = await this.db
      .repo(Invoice)
      .count({ where: { tenantId } });
    const invoiceNumber =
      existing?.invoiceNumber ??
      `INV-PHR-${String(invoiceCount + 1).padStart(6, "0")}`;

    let pharmacyInvoiceId: string;
    if (existing) {
      await this.db.repo(Invoice).update(existing.id, {
        lineItems,
        subtotal: String(r2(subtotal)),
        discountAmount: "0",
        taxableAmount: String(r2(taxable)),
        cgstAmount: String(r2(totalCgst)),
        sgstAmount: String(r2(totalSgst)),
        igstAmount: "0",
        totalAmount: String(totalAmount),
        amountPaid: String(totalAmount),
        balanceDue: "0",
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: dto.paymentMethod,
        paidAt: now,
      });
      pharmacyInvoiceId = existing.id;
    } else {
      const savedInvoice = await this.db.repo(Invoice).save(
        this.db.repo(Invoice).create({
          tenantId,
          patientId: order.patientId,
          appointmentId: order.appointmentId,
          invoiceNumber,
          invoiceType: InvoiceType.PHARMACY,
          lineItems,
          subtotal: String(r2(subtotal)),
          discountAmount: "0",
          taxableAmount: String(r2(taxable)),
          cgstAmount: String(r2(totalCgst)),
          sgstAmount: String(r2(totalSgst)),
          igstAmount: "0",
          totalAmount: String(totalAmount),
          amountPaid: String(totalAmount),
          balanceDue: "0",
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: dto.paymentMethod,
          paidAt: now,
        }),
      );
      pharmacyInvoiceId = savedInvoice.id;
    }
    // Same reasoning as the other dispense path above — write the
    // InvoicePayment ledger row directly since this bypasses confirmPayment().
    await this.db.repo(InvoicePayment).save(
      this.db.repo(InvoicePayment).create({
        tenantId,
        invoiceId: pharmacyInvoiceId,
        amount: String(totalAmount),
        paymentMethod: dto.paymentMethod,
        paidAt: now,
      }),
    );

    // Mark order dispensed
    await this.db.repo(PharmacyOrder).update(id, {
      status: PharmacyOrderStatus.DISPENSED,
      dispensedAt: now,
      dispenserNotes: dto.dispenserNotes ?? null,
    });

    return this.findOrderById(id, tenantId);
  }

  // ── Pharmacy Purchase Invoice ─────────────────────────────────────────────────

  async createPurchase(
    tenantId: string,
    dto: CreatePurchaseDto,
    userId?: string,
  ) {
    let totalAmount = 0;
    const itemEntities: Partial<PharmacyPurchaseItem>[] = [];

    for (const item of dto.items) {
      const qty = item.quantity + (item.freeQty ?? 0);
      const discount = item.discountPercent ?? 0;
      const price = item.purchasePrice * item.quantity * (1 - discount / 100);
      const gst = item.gstRate ?? 0;
      const lineTotal = price * (1 + gst / 100);
      totalAmount += lineTotal;

      itemEntities.push({
        inventoryId: item.inventoryId ?? null,
        medicineName: item.medicineName,
        batchNo: item.batchNo ?? null,
        expiryDate: item.expiryDate ?? null,
        quantity: item.quantity,
        freeQty: item.freeQty ?? 0,
        purchasePrice: String(item.purchasePrice),
        mrp: item.mrp ? String(item.mrp) : null,
        sellingPrice: item.sellingPrice ? String(item.sellingPrice) : null,
        discountPercent: String(discount),
        gstRate: item.gstRate ? String(item.gstRate) : null,
        lineTotal: String(Math.round(lineTotal * 100) / 100),
      });

      // Auto-update inventory stock and batch/expiry
      if (item.inventoryId) {
        const inv = await this.db.repo(PharmacyInventory).findOne({
          where: { id: item.inventoryId, tenantId },
        });
        if (inv) {
          const updates: Partial<PharmacyInventory> = {
            stockQty: inv.stockQty + qty,
          };
          if (item.batchNo) updates.batchNo = item.batchNo;
          if (item.expiryDate) updates.expiryDate = item.expiryDate;
          if (item.mrp) updates.mrp = String(item.mrp);
          if (item.sellingPrice)
            updates.sellingPrice = String(item.sellingPrice);
          await this.db
            .repo(PharmacyInventory)
            .update(item.inventoryId, updates);
        }
      }
    }

    const purchase = this.db.repo(PharmacyPurchase).create({
      tenantId,
      vendorName: dto.vendorName,
      invoiceNo: dto.invoiceNo ?? null,
      purchaseDate: dto.purchaseDate,
      totalAmount: String(Math.round(totalAmount * 100) / 100),
      discountAmount: "0",
      notes: dto.notes ?? null,
      createdBy: userId ?? null,
      items: itemEntities as PharmacyPurchaseItem[],
    });

    return this.db.repo(PharmacyPurchase).save(purchase);
  }

  async listPurchases(tenantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.db.repo(PharmacyPurchase).findAndCount({
      where: { tenantId },
      order: { createdAt: "DESC" },
      skip,
      take: limit,
    });
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPurchaseById(id: string, tenantId: string) {
    const p = await this.db
      .repo(PharmacyPurchase)
      .findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException("Purchase not found");
    return p;
  }

  async getPharmacyAnalytics(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Revenue from pharmacy invoices
    const invoices = await this.db.repo(Invoice).find({
      where: { tenantId, invoiceType: InvoiceType.PHARMACY } as any,
      select: ["totalAmount", "paidAt", "createdAt"] as any,
      order: { createdAt: "DESC" },
      take: 2000,
    });

    const inPeriod = invoices.filter((i) => new Date(i.createdAt) >= since);
    const totalRevenue = inPeriod.reduce(
      (s, i) => s + parseFloat((i as any).totalAmount ?? 0),
      0,
    );

    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    for (const inv of inPeriod) {
      const date = new Date(inv.createdAt).toISOString().split("T")[0];
      if (!dailyMap[date]) dailyMap[date] = { orders: 0, revenue: 0 };
      dailyMap[date].orders++;
      dailyMap[date].revenue += parseFloat((inv as any).totalAmount ?? 0);
    }
    const dailyRevenue = Object.entries(dailyMap)
      .map(([date, v]) => ({
        date,
        orders: v.orders,
        revenue: Math.round(v.revenue * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Expiry timeline — items expiring in next 6 months grouped by month
    const sixMonths = new Date();
    sixMonths.setDate(sixMonths.getDate() + 180);
    const expiringItems = await this.db.repo(PharmacyInventory).find({
      where: {
        tenantId,
        isActive: true,
        expiryDate: LessThanOrEqual(sixMonths.toISOString().slice(0, 10)),
      },
      order: { expiryDate: "ASC" },
      take: 100,
    });

    const expiryByMonth: Record<string, { count: number; value: number }> = {};
    for (const item of expiringItems) {
      if (!item.expiryDate) continue;
      const month = item.expiryDate.slice(0, 7); // YYYY-MM
      if (!expiryByMonth[month]) expiryByMonth[month] = { count: 0, value: 0 };
      expiryByMonth[month].count++;
      expiryByMonth[month].value +=
        parseFloat(item.sellingPrice) * item.stockQty;
    }
    const expiryTimeline = Object.entries(expiryByMonth)
      .map(([month, v]) => ({
        month,
        count: v.count,
        value: Math.round(v.value * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      period: days,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalInvoices: inPeriod.length,
      dailyRevenue,
      expiryTimeline,
    };
  }

  // ── Consolidated alerts (doctor-visible) ──────────────────────────────────────

  async getAlerts(tenantId: string) {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setDate(threeMonthsFromNow.getDate() + 90);

    const [lowStock, expiring] = await Promise.all([
      this.getLowStockItems(tenantId),
      this.db.repo(PharmacyInventory).find({
        where: {
          tenantId,
          isActive: true,
          expiryDate: LessThanOrEqual(
            threeMonthsFromNow.toISOString().slice(0, 10),
          ),
        },
        order: { expiryDate: "ASC" },
        take: 20,
      }),
    ]);

    return {
      lowStock: lowStock ?? [],
      expiring,
      totalAlerts: (lowStock?.length ?? 0) + expiring.length,
    };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  LabTest,
  LabOrder,
  LabOrderItem,
  LabReagent,
  LabReagentUsage,
  Invoice,
  Tenant,
  LabOrderStatus,
  LabResultFlag,
  TenantEntityManager,
  ILike,
} from '@mediflow/database';

export class CreateLabTestDto {
  name: string;
  code: string;
  category: string;
  unit?: string;
  normalRange?: string;
  price?: number;
  gstRate?: number;
  turnaround?: number;
}

export class CreateLabOrderDto {
  patientId: string;
  orderedById: string;
  appointmentId?: string;
  priority?: string;
  clinicalNotes?: string;
  sampleType?: string;
  testIds: string[];
}

export class UpdateLabOrderItemDto {
  result?: string;
  unit?: string;
  normalRange?: string;
  flag?: LabResultFlag;
  notes?: string;
}

export class CollectPaymentDto {
  paymentMethod: 'CASH' | 'CARD' | 'UPI' | 'ONLINE';
  amountPaid: number;
  waived?: boolean;
}
export class MarkOutsourcedDto {
  externalLabName: string;
  externalReference?: string;
}
export class CreateReagentDto {
  name: string;
  unit: string;
  currentQty?: number;
  reorderLevel?: number;
  unitCost?: number;
  manufacturer?: string;
  batchNo?: string;
  expiryDate?: string;
}
export class LogReagentUsageDto {
  quantity: number;
  type?: 'USE' | 'RESTOCK' | 'DISCARD' | 'ADJUST';
  notes?: string;
  labOrderId?: string;
}

@Injectable()
export class LabService {
  constructor(
    private readonly db: TenantEntityManager,
    @InjectDataSource() private readonly platformDs: DataSource,
  ) {}

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.db.repo(LabOrder).count({ where: { tenantId } });
    return `LAB-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private async loadOrder(id: string) {
    return this.db.repo(LabOrder).findOne({
      where: { id },
      relations: [
        'patient',
        'orderedBy',
        'assignedTo',
        'items',
        'items.labTest',
      ],
    });
  }

  async createTest(tenantId: string, dto: CreateLabTestDto) {
    const existing = await this.db
      .repo(LabTest)
      .findOne({ where: { tenantId, code: dto.code } });
    if (existing)
      throw new ConflictException(
        `Lab test with code '${dto.code}' already exists`,
      );

    return this.db.repo(LabTest).save(
      this.db.repo(LabTest).create({
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        category: dto.category,
        unit: dto.unit ?? null,
        normalRange: dto.normalRange ?? null,
        price: dto.price !== undefined ? String(dto.price) : '0',
        gstRate: dto.gstRate !== undefined ? String(dto.gstRate) : null,
        turnaround: dto.turnaround ?? 24,
        isActive: true,
      }),
    );
  }

  async findTests(
    tenantId: string,
    q?: string,
    category?: string,
    all = false,
  ) {
    const activeFilter = all ? {} : { isActive: true };
    if (q) {
      return this.db.repo(LabTest).find({
        where: [
          { tenantId, ...activeFilter, name: ILike(`%${q}%`) },
          { tenantId, ...activeFilter, code: ILike(`%${q}%`) },
          { tenantId, ...activeFilter, category: ILike(`%${q}%`) },
        ],
        order: { name: 'ASC' },
      });
    }
    const where: any = { tenantId, ...activeFilter };
    if (category) where.category = category;
    return this.db.repo(LabTest).find({ where, order: { name: 'ASC' } });
  }

  async findTestById(id: string, tenantId: string) {
    const test = await this.db
      .repo(LabTest)
      .findOne({ where: { id, tenantId } });
    if (!test) throw new NotFoundException('Lab test not found');
    return test;
  }

  async updateTest(
    id: string,
    tenantId: string,
    dto: Partial<CreateLabTestDto> & { isActive?: boolean },
  ) {
    await this.findTestById(id, tenantId);
    const updates: Partial<LabTest> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.normalRange !== undefined) updates.normalRange = dto.normalRange;
    if (dto.price !== undefined) updates.price = String(dto.price);
    if (dto.gstRate !== undefined) updates.gstRate = String(dto.gstRate);
    if (dto.turnaround !== undefined) updates.turnaround = dto.turnaround;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    await this.db.repo(LabTest).update(id, updates);
    return this.db.repo(LabTest).findOne({ where: { id } });
  }

  async createOrder(tenantId: string, dto: CreateLabOrderDto) {
    if (!dto.testIds?.length)
      throw new BadRequestException('At least one test is required');

    const tests = await this.db.repo(LabTest).find({
      where: dto.testIds.map((id) => ({ id, tenantId, isActive: true })),
    });

    if (tests.length !== dto.testIds.length)
      throw new BadRequestException('One or more test IDs are invalid');

    const orderNumber = await this.generateOrderNumber(tenantId);

    const order = await this.db.repo(LabOrder).save(
      this.db.repo(LabOrder).create({
        tenantId,
        orderNumber,
        patientId: dto.patientId,
        orderedById: dto.orderedById,
        appointmentId: dto.appointmentId ?? null,
        priority: dto.priority ?? 'ROUTINE',
        clinicalNotes: dto.clinicalNotes ?? null,
        sampleType: dto.sampleType ?? null,
        status: LabOrderStatus.PENDING,
      }),
    );

    const items = tests.map((test) =>
      this.db.repo(LabOrderItem).create({
        labOrderId: order.id,
        labTestId: test.id,
        unit: test.unit,
        normalRange: test.normalRange,
      }),
    );
    await this.db.repo(LabOrderItem).save(items);

    const tenant = await this.platformDs.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: ['id', 'cgstRate', 'sgstRate'],
    });
    const defaultCgst =
      tenant?.cgstRate !== null && tenant?.cgstRate !== undefined
        ? parseFloat(tenant.cgstRate)
        : parseFloat(process.env.GST_CGST_RATE ?? '0.09') * 100;
    const defaultSgst =
      tenant?.sgstRate !== null && tenant?.sgstRate !== undefined
        ? parseFloat(tenant.sgstRate)
        : parseFloat(process.env.GST_SGST_RATE ?? '0.09') * 100;

    const r2 = (n: number) => Math.round(n * 100) / 100;
    let subtotal = 0,
      totalCgst = 0,
      totalSgst = 0;

    const lineItems = tests.map((t) => {
      const price = Number(t.price);
      const gstTotal =
        t.gstRate !== null ? parseFloat(t.gstRate) : defaultCgst + defaultSgst;
      subtotal += price;
      totalCgst += (price * gstTotal) / 2 / 100;
      totalSgst += (price * gstTotal) / 2 / 100;
      return {
        testId: t.id,
        name: t.name,
        unitPrice: price,
        quantity: 1,
        gstPercent: gstTotal,
      };
    });
    const totalAmount = r2(subtotal + totalCgst + totalSgst);

    await this.db.repo(Invoice).save(
      this.db.repo(Invoice).create({
        tenantId,
        patientId: dto.patientId,
        appointmentId: dto.appointmentId ?? null,
        invoiceNumber: `INV-LAB-${orderNumber}`,
        invoiceType: 'LAB' as any,
        lineItems,
        subtotal: String(r2(subtotal)),
        discountAmount: '0',
        taxableAmount: String(r2(subtotal)),
        cgstAmount: String(r2(totalCgst)),
        sgstAmount: String(r2(totalSgst)),
        igstAmount: '0',
        totalAmount: String(totalAmount),
        paymentStatus: 'PENDING' as any,
      }),
    );

    return this.loadOrder(order.id);
  }

  async findOrders(
    tenantId: string,
    filters: {
      patientId?: string;
      status?: LabOrderStatus;
      from?: string;
      to?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const qb = this.db
      .qb(LabOrder, 'lo')
      .leftJoinAndSelect('lo.patient', 'patient')
      .leftJoinAndSelect('lo.orderedBy', 'orderedBy')
      .leftJoinAndSelect('lo.assignedTo', 'assignedTo')
      .leftJoinAndSelect('lo.items', 'items')
      .leftJoinAndSelect('items.labTest', 'labTest')
      .where('lo.tenantId = :tenantId', { tenantId });

    if (filters.patientId)
      qb.andWhere('lo.patientId = :patientId', {
        patientId: filters.patientId,
      });
    if (filters.status)
      qb.andWhere('lo.status = :status', { status: filters.status });
    if (filters.from)
      qb.andWhere('lo.createdAt >= :from', { from: new Date(filters.from) });
    if (filters.to)
      qb.andWhere('lo.createdAt <= :to', { to: new Date(filters.to) });

    qb.orderBy('lo.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOrderById(id: string, tenantId: string) {
    const order = await this.loadOrder(id);
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException('Lab order not found');
    return order;
  }

  async updateOrderStatus(
    id: string,
    tenantId: string,
    status: LabOrderStatus,
    assignedToId?: string,
  ) {
    const order = await this.db
      .repo(LabOrder)
      .findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Lab order not found');

    const updates: Partial<LabOrder> = { status };
    if (assignedToId) updates.assignedToId = assignedToId;
    if (status === LabOrderStatus.SAMPLE_COLLECTED)
      updates.collectedAt = new Date();
    if (status === LabOrderStatus.COMPLETED) updates.completedAt = new Date();

    await this.db.repo(LabOrder).update(id, updates);
    return this.loadOrder(id);
  }

  async updateOrderItemResult(
    itemId: string,
    tenantId: string,
    dto: UpdateLabOrderItemDto,
  ) {
    const item = await this.db
      .qb(LabOrderItem, 'item')
      .leftJoin('item.labOrder', 'order')
      .where('item.id = :itemId', { itemId })
      .andWhere('order.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!item) throw new NotFoundException('Lab order item not found');

    const updates: Partial<LabOrderItem> = {};
    if (dto.result !== undefined) updates.result = dto.result;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.normalRange !== undefined) updates.normalRange = dto.normalRange;
    if (dto.flag !== undefined) updates.flag = dto.flag;
    if (dto.notes !== undefined) updates.notes = dto.notes;

    await this.db.repo(LabOrderItem).update(itemId, updates);
    return this.db
      .repo(LabOrderItem)
      .findOne({ where: { id: itemId }, relations: ['labTest'] });
  }

  async getAnalytics(tenantId: string, from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      byStatus,
      todayOrders,
      avgRow,
      criticalItems,
      totalItems,
    ] = await Promise.all([
      this.db
        .qb(LabOrder, 'lo')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          { tenantId, from: fromDate, to: toDate },
        )
        .getCount(),

      this.db
        .qb(LabOrder, 'lo')
        .select('lo.status', 'status')
        .addSelect('COUNT(lo.id)', 'count')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          { tenantId, from: fromDate, to: toDate },
        )
        .groupBy('lo.status')
        .getRawMany<{ status: string; count: string }>(),

      this.db
        .qb(LabOrder, 'lo')
        .where('lo.tenantId = :tenantId AND lo.createdAt >= :today', {
          tenantId,
          today,
        })
        .getCount(),

      this.db
        .qb(LabOrder, 'lo')
        .select(
          'AVG(EXTRACT(EPOCH FROM (lo.completedAt - lo.createdAt)) / 3600)',
          'avgHours',
        )
        .where(
          'lo.tenantId = :tenantId AND lo.status = :status AND lo.completedAt IS NOT NULL AND lo.createdAt >= :from AND lo.createdAt <= :to',
          {
            tenantId,
            status: LabOrderStatus.COMPLETED,
            from: fromDate,
            to: toDate,
          },
        )
        .getRawOne<{ avgHours: string }>(),

      this.db
        .qb(LabOrderItem, 'item')
        .leftJoin('item.labOrder', 'lo')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to AND item.flag = :flag',
          {
            tenantId,
            from: fromDate,
            to: toDate,
            flag: LabResultFlag.CRITICAL,
          },
        )
        .getCount(),

      this.db
        .qb(LabOrderItem, 'item')
        .leftJoin('item.labOrder', 'lo')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          { tenantId, from: fromDate, to: toDate },
        )
        .getCount(),
    ]);

    const completedOrders = Number(
      byStatus.find((r) => r.status === LabOrderStatus.COMPLETED)?.count ?? 0,
    );
    const avgTurnaroundHours =
      Math.round(parseFloat(avgRow?.avgHours ?? '0') * 10) / 10;
    const criticalRate =
      totalItems > 0 ? Math.round((criticalItems / totalItems) * 1000) / 10 : 0;

    // Revenue from lab invoices in the period
    const revenueRow = await this.db
      .qb(Invoice, 'inv')
      .select('COALESCE(SUM(inv.totalAmount), 0)', 'total')
      .where(
        'inv.tenantId = :tenantId AND inv.invoiceType = :type AND inv.paymentStatus = :paid AND inv.createdAt >= :from AND inv.createdAt <= :to',
        {
          tenantId,
          type: 'LAB',
          paid: 'PAID',
          from: fromDate,
          to: toDate,
        },
      )
      .getRawOne<{ total: string }>();
    const completedRevenue = parseFloat(revenueRow?.total ?? '0');

    // Category breakdown: orderCount and revenue per test category
    const categoryOrders = await this.db
      .qb(LabOrderItem, 'item')
      .leftJoin('item.labOrder', 'lo')
      .leftJoin('item.labTest', 'test')
      .select('test.category', 'category')
      .addSelect('COUNT(DISTINCT lo.id)', 'orderCount')
      .addSelect('COALESCE(SUM(test.price), 0)', 'revenue')
      .where(
        'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
        { tenantId, from: fromDate, to: toDate },
      )
      .groupBy('test.category')
      .getRawMany<{ category: string; orderCount: string; revenue: string }>();

    const categoryTests = await this.db
      .qb(LabTest, 'test')
      .select('test.category', 'category')
      .addSelect('COUNT(test.id)', 'testCount')
      .addSelect(
        'SUM(CASE WHEN test.isActive THEN 1 ELSE 0 END)',
        'activeTests',
      )
      .where('test.tenantId = :tenantId', { tenantId })
      .groupBy('test.category')
      .getRawMany<{
        category: string;
        testCount: string;
        activeTests: string;
      }>();

    const categoryBreakdown: Record<
      string,
      {
        orderCount: number;
        revenue: number;
        testCount: number;
        activeTests: number;
      }
    > = {};
    for (const row of categoryTests) {
      categoryBreakdown[row.category] = {
        orderCount: 0,
        revenue: 0,
        testCount: Number(row.testCount),
        activeTests: Number(row.activeTests),
      };
    }
    for (const row of categoryOrders) {
      if (!categoryBreakdown[row.category]) {
        categoryBreakdown[row.category] = {
          orderCount: 0,
          revenue: 0,
          testCount: 0,
          activeTests: 0,
        };
      }
      categoryBreakdown[row.category].orderCount = Number(row.orderCount);
      categoryBreakdown[row.category].revenue = parseFloat(row.revenue);
    }

    return {
      period: 30,
      totalOrders,
      completedOrders,
      todayOrders,
      completedRevenue,
      avgTurnaroundHours,
      criticalItems,
      criticalRate,
      categoryBreakdown,
    };
  }

  async collectPayment(
    orderId: string,
    tenantId: string,
    dto: CollectPaymentDto,
  ) {
    const order = await this.db
      .repo(LabOrder)
      .findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Lab order not found');
    const status = dto.waived ? 'WAIVED' : 'PAID';
    await this.db.repo(LabOrder).update(orderId, {
      paymentStatus: status,
      amountPaid: String(dto.amountPaid ?? 0),
      paymentMethod: dto.waived ? null : (dto.paymentMethod ?? null),
      paymentCollectedAt: new Date(),
    } as any);
    return this.loadOrder(orderId);
  }

  async markItemOutsourced(
    orderId: string,
    itemId: string,
    tenantId: string,
    dto: MarkOutsourcedDto,
  ) {
    const order = await this.db
      .repo(LabOrder)
      .findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Lab order not found');
    await this.db.repo(LabOrderItem).update(itemId, {
      isOutsourced: true,
      externalLabName: dto.externalLabName,
      externalReference: dto.externalReference ?? null,
      outsourcedAt: new Date(),
    } as any);
    return this.loadOrder(orderId);
  }

  async listReagents(tenantId: string) {
    return this.db
      .repo(LabReagent)
      .find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  async createReagent(tenantId: string, dto: CreateReagentDto) {
    return this.db.repo(LabReagent).save(
      this.db.repo(LabReagent).create({
        tenantId,
        name: dto.name,
        unit: dto.unit,
        currentQty: String(dto.currentQty ?? 0),
        reorderLevel: String(dto.reorderLevel ?? 10),
        unitCost: String(dto.unitCost ?? 0),
        manufacturer: dto.manufacturer ?? null,
        batchNo: dto.batchNo ?? null,
        expiryDate: dto.expiryDate ?? null,
        isActive: true,
      }),
    );
  }

  async updateReagent(
    id: string,
    tenantId: string,
    dto: Partial<CreateReagentDto>,
  ) {
    const r = await this.db
      .repo(LabReagent)
      .findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Reagent not found');
    const updates: any = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.unit !== undefined) updates.unit = dto.unit;
    if (dto.currentQty !== undefined)
      updates.currentQty = String(dto.currentQty);
    if (dto.reorderLevel !== undefined)
      updates.reorderLevel = String(dto.reorderLevel);
    if (dto.unitCost !== undefined) updates.unitCost = String(dto.unitCost);
    if (dto.manufacturer !== undefined) updates.manufacturer = dto.manufacturer;
    if (dto.batchNo !== undefined) updates.batchNo = dto.batchNo;
    if (dto.expiryDate !== undefined) updates.expiryDate = dto.expiryDate;
    await this.db.repo(LabReagent).update(id, updates);
    return this.db.repo(LabReagent).findOne({ where: { id } });
  }

  async logReagentUsage(
    reagentId: string,
    tenantId: string,
    dto: LogReagentUsageDto,
    userId?: string,
  ) {
    const reagent = await this.db
      .repo(LabReagent)
      .findOne({ where: { id: reagentId, tenantId } });
    if (!reagent) throw new NotFoundException('Reagent not found');
    const usageType = dto.type ?? 'USE';
    await this.db.repo(LabReagentUsage).save(
      this.db.repo(LabReagentUsage).create({
        tenantId,
        reagentId,
        labOrderId: dto.labOrderId ?? null,
        quantity: String(Math.abs(dto.quantity)),
        type: usageType,
        notes: dto.notes ?? null,
        usedBy: userId ?? null,
      }),
    );
    const delta =
      usageType === 'RESTOCK'
        ? Math.abs(dto.quantity)
        : -Math.abs(dto.quantity);
    const newQty = Math.max(0, parseFloat(reagent.currentQty) + delta);
    await this.db.repo(LabReagent).update(reagentId, {
      currentQty: String(Math.round(newQty * 100) / 100),
    });
    return this.db.repo(LabReagent).findOne({ where: { id: reagentId } });
  }

  async getLabDashboard(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const orders = await this.db.repo(LabOrder).find({
      where: { tenantId },
      select: [
        'id',
        'status',
        'paymentStatus',
        'amountPaid',
        'createdAt',
      ] as any,
      order: { createdAt: 'DESC' },
      take: 2000,
    });
    const inPeriod = orders.filter((o) => new Date(o.createdAt) >= since);
    const totalOrders = inPeriod.length;
    const completedOrders = inPeriod.filter(
      (o: any) => o.status === 'COMPLETED',
    ).length;
    const revenue = inPeriod.reduce(
      (s: number, o: any) => s + parseFloat(o.amountPaid ?? 0),
      0,
    );
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    for (const o of inPeriod) {
      const date = new Date(o.createdAt).toISOString().split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { orders: 0, revenue: 0 };
      dailyMap[date].orders++;
      dailyMap[date].revenue += parseFloat((o as any).amountPaid ?? 0);
    }
    const daily = Object.entries(dailyMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const reagents = await this.db
      .repo(LabReagent)
      .find({ where: { tenantId, isActive: true } });
    const lowReagents = reagents.filter(
      (r) => parseFloat(r.currentQty) <= parseFloat(r.reorderLevel),
    );
    return {
      period: days,
      totalOrders,
      completedOrders,
      completionRate:
        totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
      revenue: Math.round(revenue * 100) / 100,
      daily,
      lowReagentCount: lowReagents.length,
      lowReagents: lowReagents.slice(0, 5),
    };
  }
}

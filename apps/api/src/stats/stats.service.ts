import { Injectable } from '@nestjs/common';
import {
  Appointment,
  Invoice,
  InvoicePayment,
  IPDAdmission,
  LabOrder,
  Bed,
  PharmacyOrder,
  PharmacyInventory,
  IPDAdmissionStatus,
  LabOrderStatus,
  BedStatus,
  PharmacyOrderStatus,
  PaymentStatus,
  TenantEntityManager,
  MoreThanOrEqual,
  In,
} from '@mediflow/database';

@Injectable()
export class StatsService {
  constructor(private readonly db: TenantEntityManager) {}

  async getDashboard(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todayAppointments,
      todayIPDAdmissions,
      activeIPD,
      occupiedBeds,
      totalBeds,
      labPending,
      labInProgress,
      labCompletedToday,
    ] = await Promise.all([
      this.db.repo(Appointment).count({
        where: { tenantId, createdAt: MoreThanOrEqual(today) },
      }),
      this.db.repo(IPDAdmission).count({
        where: { tenantId, createdAt: MoreThanOrEqual(today) },
      }),
      this.db.repo(IPDAdmission).count({
        where: {
          tenantId,
          status: In([
            IPDAdmissionStatus.ADMITTED,
            IPDAdmissionStatus.UNDER_TREATMENT,
            IPDAdmissionStatus.READY_FOR_DISCHARGE,
          ]),
        },
      }),
      this.db.repo(Bed).count({
        where: { tenantId, status: BedStatus.OCCUPIED },
      }),
      this.db.repo(Bed).count({ where: { tenantId } }),
      this.db.repo(LabOrder).count({
        where: { tenantId, status: LabOrderStatus.PENDING },
      }),
      this.db.repo(LabOrder).count({
        where: {
          tenantId,
          status: In([
            LabOrderStatus.SAMPLE_COLLECTED,
            LabOrderStatus.IN_PROGRESS,
          ]),
        },
      }),
      this.db.repo(LabOrder).count({
        where: {
          tenantId,
          status: LabOrderStatus.COMPLETED,
          updatedAt: MoreThanOrEqual(today),
        },
      }),
    ]);

    // Revenue aggregations — driven off InvoicePayment (money actually
    // collected on a given date), not Invoice.totalAmount/paidAt. A
    // partially-paid invoice's paidAt updates on every payment but its
    // totalAmount isn't "revenue collected that day" — only payment rows
    // have that granularity. pendingAmount now also covers PARTIALLY_PAID
    // invoices' remaining balanceDue (previously only PENDING was summed,
    // which would have silently dropped partial-payment balances).
    const [revToday, revMtd, pendingInvoices, revByTypeMtd] = await Promise.all(
      [
        this.db
          .qb(InvoicePayment, 'pay')
          .select('COALESCE(SUM(pay.amount), 0)', 'total')
          .where('pay.tenantId = :tenantId AND pay.paidAt >= :today', {
            tenantId,
            today,
          })
          .getRawOne<{ total: string }>(),

        this.db
          .qb(InvoicePayment, 'pay')
          .select('COALESCE(SUM(pay.amount), 0)', 'total')
          .where('pay.tenantId = :tenantId AND pay.paidAt >= :monthStart', {
            tenantId,
            monthStart,
          })
          .getRawOne<{ total: string }>(),

        this.db
          .qb(Invoice, 'inv')
          .select('COALESCE(SUM(inv.balanceDue), 0)', 'total')
          .addSelect('COUNT(inv.id)', 'count')
          .where(
            'inv.tenantId = :tenantId AND inv.paymentStatus IN (:...statuses)',
            {
              tenantId,
              statuses: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID],
            },
          )
          .getRawOne<{ total: string; count: string }>(),

        this.db
          .qb(InvoicePayment, 'pay')
          .innerJoin('pay.invoice', 'inv')
          .select('inv.invoiceType', 'invoiceType')
          .addSelect('COALESCE(SUM(pay.amount), 0)', 'total')
          .where('pay.tenantId = :tenantId AND pay.paidAt >= :monthStart', {
            tenantId,
            monthStart,
          })
          .groupBy('inv.invoiceType')
          .getRawMany<{ invoiceType: string; total: string }>(),
      ],
    );

    // Department load today
    const deptLoad = await this.db
      .qb(Appointment, 'appt')
      .innerJoin('appt.department', 'dept')
      .select('dept.id', 'deptId')
      .addSelect('dept.name', 'name')
      .addSelect('dept.icon', 'icon')
      .addSelect('dept.color', 'color')
      .addSelect('COUNT(appt.id)', 'count')
      .where('appt.tenantId = :tenantId AND appt.createdAt >= :today', {
        tenantId,
        today,
      })
      .groupBy('dept.id')
      .addGroupBy('dept.name')
      .addGroupBy('dept.icon')
      .addGroupBy('dept.color')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany<{
        deptId: string;
        name: string;
        icon: string;
        color: string;
        count: string;
      }>();

    const byType: Record<string, number> = {};
    for (const row of revByTypeMtd) {
      byType[row.invoiceType] = parseFloat(row.total || '0');
    }

    return {
      today: {
        appointments: todayAppointments,
        ipdAdmissions: todayIPDAdmissions,
        labCompleted: labCompletedToday,
      },
      ipd: {
        activeAdmissions: activeIPD,
        bedsOccupied: occupiedBeds,
        bedsTotal: totalBeds,
        occupancyRate:
          totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      },
      lab: {
        pending: labPending,
        inProgress: labInProgress,
        completedToday: labCompletedToday,
      },
      revenue: {
        today: parseFloat(revToday?.total || '0'),
        mtd: parseFloat(revMtd?.total || '0'),
        pendingAmount: parseFloat(pendingInvoices?.total || '0'),
        pendingCount: Number(pendingInvoices?.count || 0),
        byType,
      },
      departmentLoad: deptLoad.map((row) => ({
        department: {
          id: row.deptId,
          name: row.name,
          icon: row.icon || '🏥',
          color: row.color || '#6366f1',
        },
        count: Number(row.count),
      })),
    };
  }

  async getRevenueStats(tenantId: string, from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();

    const rev = await this.db
      .qb(InvoicePayment, 'pay')
      .select('SUM(pay.amount)', 'total')
      .where(
        'pay.tenantId = :tenantId AND pay.paidAt >= :since AND pay.paidAt <= :until',
        {
          tenantId,
          since: fromDate,
          until: toDate,
        },
      )
      .getRawOne<{ total: string }>();

    const totalRevenue = parseFloat(rev?.total || '0');

    const byType = await this.db
      .qb(InvoicePayment, 'pay')
      .innerJoin('pay.invoice', 'inv')
      .select('inv.invoiceType', 'invoiceType')
      .addSelect('SUM(pay.amount)', 'total')
      .addSelect('COUNT(DISTINCT inv.id)', 'count')
      .where(
        'pay.tenantId = :tenantId AND pay.paidAt >= :since AND pay.paidAt <= :until',
        {
          tenantId,
          since: fromDate,
          until: toDate,
        },
      )
      .groupBy('inv.invoiceType')
      .getRawMany<{ invoiceType: string; total: string; count: string }>();

    const pending = await this.db
      .qb(Invoice, 'inv')
      .select('SUM(inv.balanceDue)', 'total')
      .addSelect('COUNT(inv.id)', 'count')
      .where(
        'inv.tenantId = :tenantId AND inv.paymentStatus IN (:...statuses)',
        {
          tenantId,
          statuses: [PaymentStatus.PENDING, PaymentStatus.PARTIALLY_PAID],
        },
      )
      .getRawOne<{ total: string; count: string }>();

    return {
      period: { from: fromDate, to: toDate },
      totalRevenue,
      byType: byType.map((r) => ({
        invoiceType: r.invoiceType,
        total: parseFloat(r.total || '0'),
        count: Number(r.count),
      })),
      pending: {
        total: parseFloat(pending?.total || '0'),
        count: Number(pending?.count || 0),
      },
    };
  }

  async getAppointmentStats(tenantId: string, from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();

    const [byStatus, byDepartment, byDoctor, totalCount] = await Promise.all([
      this.db
        .qb(Appointment, 'appt')
        .select('appt.status', 'status')
        .addSelect('COUNT(appt.id)', 'count')
        .where(
          'appt.tenantId = :tenantId AND appt.createdAt >= :from AND appt.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .groupBy('appt.status')
        .getRawMany<{ status: string; count: string }>(),

      this.db
        .qb(Appointment, 'appt')
        .leftJoin('appt.department', 'dept')
        .select('dept.name', 'departmentName')
        .addSelect('COUNT(appt.id)', 'count')
        .where(
          'appt.tenantId = :tenantId AND appt.createdAt >= :from AND appt.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .groupBy('dept.name')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany<{ departmentName: string; count: string }>(),

      this.db
        .qb(Appointment, 'appt')
        .leftJoin('appt.doctor', 'doctor')
        .select('appt.doctorId', 'doctorId')
        .addSelect(
          "CONCAT(doctor.firstName, ' ', doctor.lastName)",
          'doctorName',
        )
        .addSelect('COUNT(appt.id)', 'count')
        .where(
          'appt.tenantId = :tenantId AND appt.createdAt >= :from AND appt.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .groupBy('appt.doctorId')
        .addGroupBy('doctor.firstName')
        .addGroupBy('doctor.lastName')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany<{ doctorId: string; doctorName: string; count: string }>(),

      this.db.repo(Appointment).count({
        where: {
          tenantId,
          createdAt: MoreThanOrEqual(fromDate),
        },
      }),
    ]);

    return {
      period: { from: fromDate, to: toDate },
      total: totalCount,
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      byDepartment: byDepartment.map((r) => ({
        departmentName: r.departmentName ?? 'Unassigned',
        count: Number(r.count),
      })),
      byDoctor: byDoctor.map((r) => ({
        doctorId: r.doctorId,
        doctorName: r.doctorName,
        count: Number(r.count),
      })),
    };
  }

  async getIPDStats(tenantId: string) {
    const [admissionsByStatus, avgStay, bedOccupancy] = await Promise.all([
      this.db
        .qb(IPDAdmission, 'adm')
        .select('adm.status', 'status')
        .addSelect('COUNT(adm.id)', 'count')
        .where('adm.tenantId = :tenantId', { tenantId })
        .groupBy('adm.status')
        .getRawMany<{ status: string; count: string }>(),

      this.db
        .qb(IPDAdmission, 'adm')
        .select(
          'AVG(EXTRACT(EPOCH FROM (COALESCE(adm.dischargedAt, NOW()) - adm.admittedAt)) / 86400)',
          'avgDays',
        )
        .where('adm.tenantId = :tenantId', { tenantId })
        .getRawOne<{ avgDays: string }>(),

      this.db
        .qb(Bed, 'bed')
        .select('bed.status', 'status')
        .addSelect('COUNT(bed.id)', 'count')
        .where('bed.tenantId = :tenantId', { tenantId })
        .groupBy('bed.status')
        .getRawMany<{ status: string; count: string }>(),
    ]);

    const bedStats: Record<string, number> = {};
    for (const row of bedOccupancy) {
      bedStats[row.status] = Number(row.count);
    }

    return {
      admissions: admissionsByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      avgLengthOfStayDays: parseFloat(avgStay?.avgDays || '0'),
      bedOccupancy: {
        available: bedStats[BedStatus.AVAILABLE] ?? 0,
        occupied: bedStats[BedStatus.OCCUPIED] ?? 0,
        total: Object.values(bedStats).reduce((a, b) => a + b, 0),
      },
    };
  }

  async getLabStats(tenantId: string, from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();

    const [byStatus, byPriority, totalOrders] = await Promise.all([
      this.db
        .qb(LabOrder, 'lo')
        .select('lo.status', 'status')
        .addSelect('COUNT(lo.id)', 'count')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .groupBy('lo.status')
        .getRawMany<{ status: string; count: string }>(),

      this.db
        .qb(LabOrder, 'lo')
        .select('lo.priority', 'priority')
        .addSelect('COUNT(lo.id)', 'count')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .groupBy('lo.priority')
        .getRawMany<{ priority: string; count: string }>(),

      this.db
        .qb(LabOrder, 'lo')
        .where(
          'lo.tenantId = :tenantId AND lo.createdAt >= :from AND lo.createdAt <= :to',
          {
            tenantId,
            from: fromDate,
            to: toDate,
          },
        )
        .getCount(),
    ]);

    return {
      period: { from: fromDate, to: toDate },
      total: totalOrders,
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      byPriority: byPriority.map((r) => ({
        priority: r.priority,
        count: Number(r.count),
      })),
    };
  }

  async getPharmacyStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const [
      inventoryRows,
      lowStockRows,
      expiringSoonRows,
      categoryRows,
      dispensedToday,
      dispensedMTD,
      pendingOrders,
      revenueRow,
    ] = await Promise.all([
      this.db
        .qb(PharmacyInventory, 'inv')
        .select('COUNT(inv.id)', 'totalItems')
        .addSelect(
          'COALESCE(SUM(inv.stockQty * inv.sellingPrice), 0)',
          'inventoryValue',
        )
        .where('inv.tenantId = :tenantId AND inv.isActive = true', { tenantId })
        .getRawOne<{ totalItems: string; inventoryValue: string }>(),

      this.db
        .qb(PharmacyInventory, 'inv')
        .select('COUNT(inv.id)', 'count')
        .addSelect(
          'COALESCE(SUM(inv.stockQty * inv.sellingPrice::numeric), 0)',
          'value',
        )
        .where(
          'inv.tenantId = :tenantId AND inv.isActive = true AND inv.stockQty <= inv.reorderLevel',
          { tenantId },
        )
        .getRawOne<{ count: string; value: string }>(),

      this.db
        .qb(PharmacyInventory, 'inv')
        .select('COUNT(inv.id)', 'count')
        .addSelect(
          'COALESCE(SUM(inv.stockQty * inv.sellingPrice::numeric), 0)',
          'value',
        )
        .where(
          'inv.tenantId = :tenantId AND inv.isActive = true AND inv.expiryDate IS NOT NULL AND inv.expiryDate <= :future',
          {
            tenantId,
            future: in90Days,
          },
        )
        .getRawOne<{ count: string; value: string }>(),

      this.db
        .qb(PharmacyInventory, 'inv')
        .select("COALESCE(inv.category, 'Uncategorized')", 'category')
        .addSelect('COUNT(inv.id)', 'count')
        .addSelect(
          'COALESCE(SUM(inv.stockQty * inv.sellingPrice::numeric), 0)',
          'value',
        )
        .where('inv.tenantId = :tenantId AND inv.isActive = true', { tenantId })
        .groupBy('inv.category')
        .getRawMany<{ category: string; count: string; value: string }>(),

      this.db
        .qb(PharmacyOrder, 'po')
        .where(
          'po.tenantId = :tenantId AND po.status = :status AND po.dispensedAt >= :today',
          {
            tenantId,
            status: PharmacyOrderStatus.DISPENSED,
            today,
          },
        )
        .getCount(),

      this.db
        .qb(PharmacyOrder, 'po')
        .where(
          'po.tenantId = :tenantId AND po.status = :status AND po.dispensedAt >= :monthStart',
          {
            tenantId,
            status: PharmacyOrderStatus.DISPENSED,
            monthStart,
          },
        )
        .getCount(),

      this.db
        .qb(PharmacyOrder, 'po')
        .where('po.tenantId = :tenantId AND po.status = :status', {
          tenantId,
          status: PharmacyOrderStatus.PENDING,
        })
        .getCount(),

      this.db
        .qb(Invoice, 'inv')
        .select('COALESCE(SUM(inv.totalAmount), 0)', 'total')
        .where(
          'inv.tenantId = :tenantId AND inv.invoiceType = :type AND inv.paymentStatus = :paid AND inv.paidAt >= :monthStart',
          {
            tenantId,
            type: 'PHARMACY',
            paid: 'PAID',
            monthStart,
          },
        )
        .getRawOne<{ total: string }>(),
    ]);

    const categoryBreakdown: Record<string, { count: number; value: number }> =
      {};
    for (const row of categoryRows) {
      categoryBreakdown[row.category ?? 'Uncategorized'] = {
        count: Number(row.count),
        value: parseFloat(row.value),
      };
    }

    return {
      inventory: {
        totalItems: Number(inventoryRows?.totalItems ?? 0),
        inventoryValue: parseFloat(inventoryRows?.inventoryValue ?? '0'),
        lowStockCount: Number(lowStockRows?.count ?? 0),
        lowStockValue: parseFloat(lowStockRows?.value ?? '0'),
        expiringSoonCount: Number(expiringSoonRows?.count ?? 0),
        expiringSoonValue: parseFloat(expiringSoonRows?.value ?? '0'),
        categoryBreakdown,
      },
      orders: {
        dispensedToday,
        dispensedMTD,
        pending: pendingOrders,
        revenueMTD: parseFloat(revenueRow?.total ?? '0'),
      },
    };
  }
}

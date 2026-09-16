import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppointmentsGateway } from './appointments.gateway';
import { v4 as uuidv4 } from 'uuid';
import {
  Appointment,
  DoctorSlot,
  PharmacyOrder,
  Invoice,
  InvoicePayment,
  Tenant,
  AppointmentStatus,
  AppointmentType,
  PaymentStatus,
  InvoiceType,
  DiscountType,
  PharmacyOrderStatus,
  TenantEntityManager,
} from '@mediflow/database';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@mediflow/shared';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

// Resolves a cashier-entered discount (percentage or flat) against a known
// subtotal, clamped to [0, subtotal]. Mirrors invoices.service.ts's
// resolveDiscountAmount, sized for this method's simpler {description,amount}
// line-item shape (no per-item quantity/unitPrice to sum here).
function resolveFlatDiscount(
  subtotal: number,
  discountType?: DiscountType,
  discountValue?: number,
): number {
  if (!discountType || discountValue === undefined || discountValue === null)
    return 0;
  const raw =
    discountType === DiscountType.PERCENTAGE
      ? (subtotal * discountValue) / 100
      : discountValue;
  return Math.max(0, Math.min(raw, subtotal));
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly db: TenantEntityManager,
    private kafka: KafkaProducerService,
    @InjectDataSource() private readonly platformDs: DataSource,
    @Optional() private readonly gateway: AppointmentsGateway | null = null,
  ) {}

  private async tenantAllowsConsultBeforePayment(
    tenantId: string,
  ): Promise<boolean> {
    const tenant = await this.platformDs.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: ['id', 'allowConsultationBeforePayment'],
    });
    return tenant?.allowConsultationBeforePayment ?? false;
  }

  private emit(
    tenantId: string,
    id: string,
    status: string,
    tokenNumber?: number | null,
  ) {
    this.gateway?.emitStatusUpdate(tenantId, { id, status, tokenNumber });
  }

  async create(tenantId: string, dto: CreateAppointmentDto) {
    return this.db.transaction(async (em) => {
      const apptRepo = em.getRepository(Appointment);
      const slotRepo = em.getRepository(DoctorSlot);

      let tokenNumber: number | null = null;
      let scheduledAt: Date | null = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : null;

      if (dto.slotId) {
        const slot = await slotRepo.findOne({
          where: { id: dto.slotId, tenantId },
        });
        if (!slot) throw new NotFoundException('Slot not found');
        if (slot.isBlocked) throw new BadRequestException('Slot is blocked');
        if (slot.bookedCount >= slot.maxPatients) {
          throw new ConflictException('Slot is fully booked');
        }
        await slotRepo.increment({ id: slot.id }, 'bookedCount', 1);
        tokenNumber = slot.bookedCount + 1;
        scheduledAt = new Date(`${slot.slotDate}T${slot.startTime}`);
      }

      const todayCount = await apptRepo.count({
        where: { tenantId, doctorId: dto.doctorId },
      });

      const appointment = await apptRepo.save(
        apptRepo.create({
          tenantId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          slotId: dto.slotId ?? null,
          departmentId: dto.departmentId ?? null,
          visitType: dto.visitType,
          appointmentType: dto.appointmentType ?? AppointmentType.IN_PERSON,
          chiefComplaint: dto.chiefComplaint ?? null,
          referredBy: dto.referredBy ?? null,
          opinionObtainedBy: dto.opinionObtainedBy ?? null,
          scheduledAt,
          tokenNumber: tokenNumber ?? todayCount + 1,
          status: AppointmentStatus.REGISTERED,
          paymentStatus: PaymentStatus.PENDING,
        }),
      );

      await this.kafka.emit(KAFKA_TOPICS.APPOINTMENT_BOOKED, {
        eventId: uuidv4(),
        eventType: 'appointment.booked',
        tenantId,
        timestamp: new Date().toISOString(),
        data: {
          appointmentId: appointment.id,
          tenantId,
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          slotId: appointment.slotId,
          appointmentType: appointment.appointmentType,
          scheduledAt: appointment.scheduledAt?.toISOString() ?? null,
          tokenNumber: appointment.tokenNumber,
          paymentStatus: appointment.paymentStatus,
        },
      });

      return apptRepo.findOne({
        where: { id: appointment.id },
        relations: ['patient', 'doctor', 'slot', 'department'],
      });
    });
  }

  async confirmPayment(
    id: string,
    tenantId: string,
    paymentMethod: string,
    amount: number,
    razorpayPaymentId?: string,
    options?: {
      lineItems?: { description: string; amount: number; discount?: number }[];
      discountType?: DiscountType;
      discountValue?: number;
      collectedByUserId?: string;
    },
  ) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot confirm payment for cancelled appointment',
      );
    }

    const now = new Date();
    // Only advance REGISTERED → CONFIRMED here. If the patient was already
    // seen before paying (allowConsultationBeforePayment tenants), the
    // appointment has moved past REGISTERED already — don't regress its
    // workflow status, just clear the payment.
    const statusUpdate =
      appointment.status === AppointmentStatus.REGISTERED
        ? { status: AppointmentStatus.CONFIRMED, confirmedAt: now }
        : {};

    return this.db.transaction(async (em) => {
      const invoiceRepo = em.getRepository(Invoice);
      const paymentRepo = em.getRepository(InvoicePayment);

      // Create or reuse the consultation invoice so revenue stats are accurate.
      let invoice = await invoiceRepo.findOne({
        where: {
          appointmentId: id,
          tenantId,
          invoiceType: InvoiceType.CONSULTATION,
        },
      });

      if (!invoice) {
        const lineItems =
          options?.lineItems && options.lineItems.length > 0
            ? options.lineItems
            : [{ description: 'Consultation Fee', amount }];
        const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
        const discountAmount = resolveFlatDiscount(
          subtotal,
          options?.discountType,
          options?.discountValue,
        );
        const totalAmount = Math.max(
          0,
          Math.round((subtotal - discountAmount) * 100) / 100,
        );
        const invoiceCount = await invoiceRepo.count({ where: { tenantId } });
        const invoiceNumber = `INV-OPD-${String(invoiceCount + 1).padStart(6, '0')}`;
        invoice = await invoiceRepo.save(
          invoiceRepo.create({
            tenantId,
            patientId: appointment.patientId,
            appointmentId: id,
            invoiceNumber,
            invoiceType: InvoiceType.CONSULTATION,
            lineItems,
            subtotal: String(subtotal),
            discountAmount: String(discountAmount),
            discountType: options?.discountType ?? null,
            discountValue:
              options?.discountValue !== undefined
                ? String(options.discountValue)
                : null,
            taxableAmount: String(totalAmount),
            cgstAmount: '0',
            sgstAmount: '0',
            igstAmount: '0',
            totalAmount: String(totalAmount),
            amountPaid: '0',
            balanceDue: String(totalAmount),
            paymentStatus: PaymentStatus.PENDING,
          }),
        );
      }

      if (invoice.paymentStatus === PaymentStatus.PAID) {
        throw new BadRequestException('Invoice already paid');
      }

      const balanceDue =
        invoice.balanceDue !== null &&
        invoice.balanceDue !== undefined &&
        parseFloat(invoice.balanceDue) > 0
          ? parseFloat(invoice.balanceDue)
          : parseFloat(invoice.totalAmount) -
            parseFloat(invoice.amountPaid ?? '0');
      const requested =
        amount !== undefined && amount !== null ? amount : balanceDue;
      if (requested <= 0)
        throw new BadRequestException(
          'Payment amount must be greater than zero',
        );
      const collected = Math.min(requested, balanceDue);
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

      await invoiceRepo.update(invoice.id, {
        paymentStatus: newStatus,
        paymentMethod: paymentMethod ?? null,
        razorpayPaymentId: razorpayPaymentId ?? null,
        amountPaid: String(newAmountPaid),
        balanceDue: String(newBalanceDue),
        paidAt: now,
      });
      await paymentRepo.save(
        paymentRepo.create({
          tenantId,
          invoiceId: invoice.id,
          amount: String(Math.round(collected * 100) / 100),
          paymentMethod,
          paidAt: now,
          collectedByUserId: options?.collectedByUserId ?? null,
        }),
      );

      await em.getRepository(Appointment).update(id, {
        paymentStatus: newStatus,
        paymentAmount: String(newAmountPaid),
        razorpayPaymentId: razorpayPaymentId ?? null,
        ...statusUpdate,
      });

      return em.getRepository(Appointment).findOne({
        where: { id },
        relations: ['patient', 'doctor', 'slot', 'department'],
      });
    });
  }

  async getActivePatients(
    tenantId: string,
    filters: {
      doctorId?: string;
      departmentId?: string;
      date?: string;
      paymentStatus?: PaymentStatus;
    },
  ) {
    const today = filters.date ? new Date(filters.date) : new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const qb = this.db
      .qb(Appointment, 'appt')
      .leftJoinAndSelect('appt.patient', 'patient')
      .leftJoinAndSelect('appt.doctor', 'doctor')
      .leftJoinAndSelect('appt.slot', 'slot')
      .leftJoinAndSelect('appt.department', 'department')
      .where('appt.tenantId = :tenantId', { tenantId });

    if (filters.doctorId)
      qb.andWhere('appt.doctorId = :doctorId', { doctorId: filters.doctorId });
    if (filters.departmentId)
      qb.andWhere('appt.departmentId = :departmentId', {
        departmentId: filters.departmentId,
      });

    // When paymentStatus filter is supplied (e.g. billing counter querying PENDING),
    // return only today's appointments matching that payment status.
    if (filters.paymentStatus) {
      qb.andWhere('appt.paymentStatus = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      })
        .andWhere('appt.createdAt BETWEEN :startOfDay AND :endOfDay', {
          startOfDay,
          endOfDay,
        })
        .andWhere('appt.status NOT IN (:...excluded)', {
          excluded: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        });
    } else {
      const prePay = [AppointmentStatus.REGISTERED];
      const active = [
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.CHECKED_IN,
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.SENT_TO_PHARMACY,
      ];

      qb.andWhere(
        `(
          (appt.status IN (:...prePay) AND appt.createdAt BETWEEN :startOfDay AND :endOfDay)
          OR
          (appt.status IN (:...active) AND appt.createdAt BETWEEN :startOfDay AND :endOfDay)
        )`,
        { prePay, active, startOfDay, endOfDay },
      );
    }

    return qb
      .orderBy('appt.tokenNumber', 'ASC')
      .addOrderBy('appt.createdAt', 'ASC')
      .getMany();
  }

  async findAll(
    tenantId: string,
    filters: {
      doctorId?: string;
      departmentId?: string;
      patientId?: string;
      status?: AppointmentStatus;
      from?: string;
      to?: string;
    },
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const qb = this.db
      .qb(Appointment, 'appt')
      .leftJoinAndSelect('appt.patient', 'patient')
      .leftJoinAndSelect('appt.doctor', 'doctor')
      .leftJoinAndSelect('appt.slot', 'slot')
      .leftJoinAndSelect('appt.department', 'department')
      .where('appt.tenantId = :tenantId', { tenantId });

    if (filters.doctorId)
      qb.andWhere('appt.doctorId = :doctorId', { doctorId: filters.doctorId });
    if (filters.departmentId)
      qb.andWhere('appt.departmentId = :departmentId', {
        departmentId: filters.departmentId,
      });
    if (filters.patientId)
      qb.andWhere('appt.patientId = :patientId', {
        patientId: filters.patientId,
      });
    if (filters.status)
      qb.andWhere('appt.status = :status', { status: filters.status });
    if (filters.from)
      qb.andWhere('appt.createdAt >= :from', { from: new Date(filters.from) });
    if (filters.to)
      qb.andWhere('appt.createdAt <= :to', { to: new Date(filters.to) });

    qb.orderBy('appt.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, tenantId: string) {
    const appointment = await this.db.repo(Appointment).findOne({
      where: { id, tenantId },
      relations: [
        'patient',
        'doctor',
        'slot',
        'department',
        'consultation',
        'consultation.prescriptions',
        'consultation.prescriptions.items',
        'consultation.followUps',
        'pharmacyOrder',
      ],
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /**
   * Returns today's queue for a specific doctor, or the full-day queue for all
   * doctors when doctorId is null (used by nurses who assist any patient).
   */
  async findDoctorQueue(
    doctorId: string | null,
    tenantId: string,
    date?: string,
    statuses?: AppointmentStatus[],
  ) {
    const target = date ? new Date(date) : new Date();
    const startOfDay = new Date(target);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(target);
    endOfDay.setHours(23, 59, 59, 999);

    const qb = this.db
      .qb(Appointment, 'appt')
      .leftJoinAndSelect('appt.patient', 'patient')
      .leftJoinAndSelect('appt.slot', 'slot')
      .leftJoinAndSelect('appt.doctor', 'doctor')
      .where('appt.tenantId = :tenantId', { tenantId })
      .orderBy('appt.tokenNumber', 'ASC')
      .addOrderBy('appt.createdAt', 'ASC');

    if (statuses) {
      // Nurse mode: all active statuses today (use createdAt — walk-ins have no scheduledAt)
      qb.andWhere('appt.status IN (:...statuses)', { statuses }).andWhere(
        'appt.createdAt BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
    } else {
      // Doctor mode: ALL of today's appointments except cancelled/no-show
      const excludedStatuses = [
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
      ];
      qb.andWhere('appt.status NOT IN (:...excludedStatuses)', {
        excludedStatuses,
      }).andWhere('appt.createdAt BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      });
    }

    if (doctorId) {
      qb.andWhere('appt.doctorId = :doctorId', { doctorId });
    }

    return qb.getMany();
  }

  async checkIn(id: string, tenantId: string) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const canCheckInUnpaid =
      appointment.status === AppointmentStatus.REGISTERED &&
      (await this.tenantAllowsConsultBeforePayment(tenantId));

    if (
      appointment.status !== AppointmentStatus.CONFIRMED &&
      !canCheckInUnpaid
    ) {
      throw new BadRequestException(
        'Appointment must be CONFIRMED to check in',
      );
    }
    await this.db.repo(Appointment).update(id, {
      status: AppointmentStatus.CHECKED_IN,
      checkedInAt: new Date(),
    });
    this.emit(
      tenantId,
      id,
      AppointmentStatus.CHECKED_IN,
      appointment.tokenNumber,
    );
    return this.db.repo(Appointment).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'slot', 'department'],
    });
  }

  /** Reverse an accidental check-in — CHECKED_IN → CONFIRMED */
  async undoCheckIn(id: string, tenantId: string) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new BadRequestException(
        'Only CHECKED_IN appointments can be reversed',
      );
    }
    // Revert to wherever it came from: unpaid check-ins (allowed only for
    // opted-in tenants) came straight from REGISTERED, not CONFIRMED.
    const revertStatus =
      appointment.paymentStatus === PaymentStatus.PAID
        ? AppointmentStatus.CONFIRMED
        : AppointmentStatus.REGISTERED;
    await this.db.repo(Appointment).update(id, {
      status: revertStatus,
      checkedInAt: null as any,
    });
    this.emit(tenantId, id, revertStatus, appointment.tokenNumber);
    return this.db.repo(Appointment).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'slot', 'department'],
    });
  }

  async startConsultation(id: string, tenantId: string) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new BadRequestException(
        'Appointment must be CHECKED_IN to start consultation',
      );
    }
    await this.db
      .repo(Appointment)
      .update(id, { status: AppointmentStatus.IN_PROGRESS });
    this.emit(
      tenantId,
      id,
      AppointmentStatus.IN_PROGRESS,
      appointment.tokenNumber,
    );
    return this.db.repo(Appointment).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'slot', 'department'],
    });
  }

  async complete(id: string, tenantId: string) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.status !== AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Appointment must be IN_PROGRESS to complete',
      );
    }
    await this.db.repo(Appointment).update(id, {
      status: AppointmentStatus.COMPLETED,
      completedAt: new Date(),
    });
    this.emit(
      tenantId,
      id,
      AppointmentStatus.COMPLETED,
      appointment.tokenNumber,
    );

    await this.kafka.emit(KAFKA_TOPICS.APPOINTMENT_COMPLETED, {
      eventId: uuidv4(),
      eventType: 'appointment.completed',
      tenantId,
      timestamp: new Date().toISOString(),
      data: {
        appointmentId: id,
        tenantId,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        completedAt: new Date().toISOString(),
      },
    });

    return this.db.repo(Appointment).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'slot', 'department'],
    });
  }

  async sendToPharmacy(id: string, tenantId: string) {
    return this.db.transaction(async (em) => {
      const apptRepo = em.getRepository(Appointment);
      const pharmacyRepo = em.getRepository(PharmacyOrder);

      const appointment = await apptRepo.findOne({ where: { id, tenantId } });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (appointment.status !== AppointmentStatus.COMPLETED) {
        throw new BadRequestException(
          'Appointment must be COMPLETED before sending to pharmacy',
        );
      }

      const existing = await pharmacyRepo.findOne({
        where: { appointmentId: id },
      });
      if (existing) throw new ConflictException('Already sent to pharmacy');

      await pharmacyRepo.save(
        pharmacyRepo.create({
          tenantId,
          appointmentId: id,
          patientId: appointment.patientId,
          status: PharmacyOrderStatus.PENDING,
        }),
      );

      await apptRepo.update(id, {
        status: AppointmentStatus.SENT_TO_PHARMACY,
        pharmacySentAt: new Date(),
      });
      this.emit(
        tenantId,
        id,
        AppointmentStatus.SENT_TO_PHARMACY,
        appointment.tokenNumber,
      );

      return apptRepo.findOne({
        where: { id },
        relations: ['patient', 'doctor', 'slot', 'department', 'pharmacyOrder'],
      });
    });
  }

  async cancel(
    id: string,
    tenantId: string,
    reason: string,
    cancelStatus: AppointmentStatus = AppointmentStatus.CANCELLED,
  ) {
    const appointment = await this.db
      .repo(Appointment)
      .findOne({ where: { id, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw new BadRequestException('Appointment is already dismissed');
    }

    const finalStatus = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ].includes(cancelStatus)
      ? cancelStatus
      : AppointmentStatus.CANCELLED;

    await this.db.repo(Appointment).update(id, {
      status: finalStatus,
      cancellationReason: reason,
      cancelledAt: new Date(),
    });
    this.emit(tenantId, id, finalStatus, appointment.tokenNumber);

    if (appointment.slotId) {
      await this.db
        .repo(DoctorSlot)
        .decrement({ id: appointment.slotId }, 'bookedCount', 1);
    }

    await this.kafka.emit(KAFKA_TOPICS.APPOINTMENT_CANCELLED, {
      eventId: uuidv4(),
      eventType: 'appointment.cancelled',
      tenantId,
      timestamp: new Date().toISOString(),
      data: {
        appointmentId: id,
        tenantId,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        cancelledAt: new Date().toISOString(),
        reason,
      },
    });

    return this.db.repo(Appointment).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'slot', 'department'],
    });
  }

  /**
   * Queue summary counts — doctorId=null means "all doctors" (used for nurses).
   */
  async getQueueStatus(doctorId: string | null, tenantId: string) {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Helper: base query scoped to tenant + optional doctor
    const base = () => {
      const qb = this.db
        .qb(Appointment, 'appt')
        .where('appt.tenantId = :tenantId', { tenantId });
      if (doctorId) qb.andWhere('appt.doctorId = :doctorId', { doctorId });
      return qb;
    };

    const [inProgress, waiting, completedToday] = await Promise.all([
      base()
        .leftJoinAndSelect('appt.patient', 'patient')
        .andWhere('appt.status = :s', { s: AppointmentStatus.IN_PROGRESS })
        .getOne(),
      base()
        .andWhere('appt.status IN (:...s)', {
          s: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
        })
        .getCount(),
      base()
        .andWhere('appt.status = :s', { s: AppointmentStatus.COMPLETED })
        .andWhere('appt.completedAt BETWEEN :startOfDay AND :endOfDay', {
          startOfDay,
          endOfDay,
        })
        .getCount(),
    ]);

    return {
      currentPatient: inProgress,
      waitingCount: waiting,
      completedCount: completedToday,
      doctorId: doctorId ?? 'all',
    };
  }
}

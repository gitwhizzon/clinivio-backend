import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  DoctorSlot,
  DoctorProfile,
  TenantEntityManager,
} from '@mediflow/database';

export class CreateSlotDto {
  doctorId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  maxPatients?: number;
}

export class CreateSlotsBulkDto {
  doctorId: string;
  fromDate: string;
  toDate: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  maxPatients?: number;
  weekdays?: number[]; // 0=Sun, 1=Mon, ... 6=Sat
}

@Injectable()
export class SlotsService {
  constructor(private readonly db: TenantEntityManager) {}

  async createSlot(tenantId: string, dto: CreateSlotDto) {
    const existing = await this.db
      .qb(DoctorSlot, 'slot')
      .where('slot.tenantId = :tenantId', { tenantId })
      .andWhere('slot.doctorId = :doctorId', { doctorId: dto.doctorId })
      .andWhere('slot.slotDate = :slotDate', { slotDate: dto.slotDate })
      .andWhere(`(slot.startTime < :endTime AND slot.endTime > :startTime)`, {
        startTime: dto.startTime,
        endTime: dto.endTime,
      })
      .getOne();

    if (existing) {
      throw new ConflictException(
        'Overlapping slot already exists for this doctor and date',
      );
    }

    return this.db.repo(DoctorSlot).save(
      this.db.repo(DoctorSlot).create({
        tenantId,
        doctorId: dto.doctorId,
        slotDate: dto.slotDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationMinutes: dto.durationMinutes ?? 30,
        maxPatients: dto.maxPatients ?? 1,
        bookedCount: 0,
        isBlocked: false,
      }),
    );
  }

  async createSlotsBulk(tenantId: string, dto: CreateSlotsBulkDto) {
    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);
    const weekdays = dto.weekdays ?? [0, 1, 2, 3, 4, 5, 6];

    if (from > to) {
      throw new BadRequestException('fromDate must be before toDate');
    }

    const slotsToCreate: Partial<DoctorSlot>[] = [];
    const cursor = new Date(from);

    while (cursor <= to) {
      const dayOfWeek = cursor.getDay();
      if (weekdays.includes(dayOfWeek)) {
        const slotDate = cursor.toISOString().split('T')[0];
        slotsToCreate.push({
          tenantId,
          doctorId: dto.doctorId,
          slotDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          durationMinutes: dto.durationMinutes ?? 30,
          maxPatients: dto.maxPatients ?? 1,
          bookedCount: 0,
          isBlocked: false,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!slotsToCreate.length) return { count: 0 };

    const result = await this.db
      .repo(DoctorSlot)
      .createQueryBuilder()
      .insert()
      .into(DoctorSlot)
      .values(slotsToCreate)
      .orIgnore()
      .execute();

    return { count: result.identifiers.length };
  }

  async findAvailableSlots(tenantId: string, doctorId: string, date: string) {
    const slots = await this.db.repo(DoctorSlot).find({
      where: { tenantId, doctorId, slotDate: date, isBlocked: false },
      order: { startTime: 'ASC' },
    });
    return slots.filter((s) => s.bookedCount < s.maxPatients);
  }

  async findDoctorsAvailability(
    tenantId: string,
    specialty?: string,
    fromDate?: string,
    toDate?: string,
  ) {
    const qb = this.db
      .qb(DoctorProfile, 'dp')
      .leftJoinAndSelect('dp.user', 'user')
      .leftJoinAndSelect('dp.department', 'department')
      .where('dp.tenantId = :tenantId', { tenantId })
      .andWhere('dp.isAcceptingPatients = true')
      .andWhere('user.isActive = true');

    if (specialty) qb.andWhere('dp.specialty = :specialty', { specialty });

    const doctors = await qb.getMany();

    if (!fromDate && !toDate) return doctors;

    return Promise.all(
      doctors.map(async (doc) => {
        const slotsQb = this.db
          .qb(DoctorSlot, 'slot')
          .where('slot.tenantId = :tenantId', { tenantId })
          .andWhere('slot.doctorId = :doctorId', { doctorId: doc.userId })
          .andWhere('slot.isBlocked = false')
          .andWhere('slot.bookedCount < slot.maxPatients');

        if (fromDate)
          slotsQb.andWhere('slot.slotDate >= :fromDate', { fromDate });
        if (toDate) slotsQb.andWhere('slot.slotDate <= :toDate', { toDate });

        const slots = await slotsQb
          .orderBy('slot.slotDate', 'ASC')
          .addOrderBy('slot.startTime', 'ASC')
          .getMany();

        return { ...doc, slots };
      }),
    );
  }

  async findSlotById(id: string, tenantId: string) {
    const slot = await this.db
      .repo(DoctorSlot)
      .findOne({ where: { id, tenantId } });
    if (!slot) throw new NotFoundException('Slot not found');
    return slot;
  }

  async blockSlot(id: string, tenantId: string, reason?: string) {
    const slot = await this.findSlotById(id, tenantId);
    if (slot.isBlocked) throw new ConflictException('Slot is already blocked');
    await this.db
      .repo(DoctorSlot)
      .update(id, { isBlocked: true, blockReason: reason ?? null });
    return this.db.repo(DoctorSlot).findOne({ where: { id } });
  }

  async unblockSlot(id: string, tenantId: string) {
    const slot = await this.findSlotById(id, tenantId);
    if (!slot.isBlocked) throw new BadRequestException('Slot is not blocked');
    await this.db
      .repo(DoctorSlot)
      .update(id, { isBlocked: false, blockReason: null });
    return this.db.repo(DoctorSlot).findOne({ where: { id } });
  }

  async deleteSlot(id: string, tenantId: string) {
    const slot = await this.findSlotById(id, tenantId);
    if (slot.bookedCount > 0) {
      throw new BadRequestException(
        'Cannot delete slot with existing bookings',
      );
    }
    await this.db.repo(DoctorSlot).delete(id);
    return { deleted: true };
  }

  async findDoctorSlots(
    tenantId: string,
    doctorId: string,
    from?: string,
    to?: string,
  ) {
    const qb = this.db
      .qb(DoctorSlot, 'slot')
      .where('slot.tenantId = :tenantId', { tenantId })
      .andWhere('slot.doctorId = :doctorId', { doctorId });

    if (from) qb.andWhere('slot.slotDate >= :from', { from });
    if (to) qb.andWhere('slot.slotDate <= :to', { to });

    return qb
      .orderBy('slot.slotDate', 'ASC')
      .addOrderBy('slot.startTime', 'ASC')
      .getMany();
  }
}

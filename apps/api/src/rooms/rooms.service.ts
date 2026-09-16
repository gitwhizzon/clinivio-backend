import { Injectable, NotFoundException } from '@nestjs/common';
import { Room, Bed, BedStatus, TenantEntityManager } from '@mediflow/database';

export class CreateRoomDto {
  name: string;
  roomType: string;
  floor?: string;
  totalBeds: number;
  pricePerDay: number;
  amenities?: any;
  notes?: string;
}

export class UpdateRoomDto {
  name?: string;
  floor?: string;
  pricePerDay?: number;
  amenities?: any;
  notes?: string;
  isActive?: boolean;
}

@Injectable()
export class RoomsService {
  constructor(private readonly db: TenantEntityManager) {}

  async create(tenantId: string, dto: CreateRoomDto) {
    return this.db.transaction(async (em) => {
      const roomRepo = em.getRepository(Room);
      const bedRepo = em.getRepository(Bed);

      const room = await roomRepo.save(
        roomRepo.create({
          tenantId,
          name: dto.name,
          roomType: dto.roomType as any,
          floor: dto.floor ?? null,
          totalBeds: dto.totalBeds,
          pricePerDay: String(dto.pricePerDay),
          amenities: dto.amenities ?? null,
          notes: dto.notes ?? null,
          isActive: true,
        }),
      );

      const beds = Array.from({ length: dto.totalBeds }, (_, i) =>
        bedRepo.create({
          tenantId,
          roomId: room.id,
          bedNumber: `B${String(i + 1).padStart(2, '0')}`,
          status: BedStatus.AVAILABLE,
        }),
      );
      await bedRepo.save(beds);

      return roomRepo.findOne({ where: { id: room.id }, relations: ['beds'] });
    });
  }

  async findAll(tenantId: string, roomType?: string) {
    const qb = this.db
      .qb(Room, 'room')
      .leftJoinAndSelect('room.beds', 'bed')
      .where('room.tenantId = :tenantId', { tenantId })
      .andWhere('room.isActive = true');

    if (roomType) qb.andWhere('room.roomType = :roomType', { roomType });

    const rooms = await qb.orderBy('room.name', 'ASC').getMany();

    return rooms.map((room) => {
      const beds = (room.beds as Bed[]) ?? [];
      const totalBeds = beds.length;
      const availableBeds = beds.filter(
        (b) => b.status === BedStatus.AVAILABLE,
      ).length;
      const occupiedBeds = beds.filter(
        (b) => b.status === BedStatus.OCCUPIED,
      ).length;
      return { ...room, totalBeds, availableBeds, occupiedBeds };
    });
  }

  async findById(id: string, tenantId: string) {
    const room = await this.db
      .repo(Room)
      .findOne({ where: { id, tenantId }, relations: ['beds'] });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async update(id: string, tenantId: string, dto: UpdateRoomDto) {
    const room = await this.db.repo(Room).findOne({ where: { id, tenantId } });
    if (!room) throw new NotFoundException('Room not found');

    const updates: Partial<Room> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.floor !== undefined) updates.floor = dto.floor;
    if (dto.pricePerDay !== undefined)
      updates.pricePerDay = String(dto.pricePerDay);
    if (dto.amenities !== undefined) updates.amenities = dto.amenities;
    if (dto.notes !== undefined) updates.notes = dto.notes;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    await this.db.repo(Room).update(id, updates);
    return this.findById(id, tenantId);
  }

  async findBeds(tenantId: string, roomId?: string, status?: BedStatus) {
    const qb = this.db
      .qb(Bed, 'bed')
      .leftJoinAndSelect('bed.room', 'room')
      .where('bed.tenantId = :tenantId', { tenantId });

    if (roomId) qb.andWhere('bed.roomId = :roomId', { roomId });
    if (status) qb.andWhere('bed.status = :status', { status });

    return qb
      .orderBy('room.name', 'ASC')
      .addOrderBy('bed.bedNumber', 'ASC')
      .getMany();
  }

  async findBedById(id: string, tenantId: string) {
    const bed = await this.db
      .repo(Bed)
      .findOne({ where: { id, tenantId }, relations: ['room'] });
    if (!bed) throw new NotFoundException('Bed not found');
    return bed;
  }

  async updateBedStatus(
    id: string,
    tenantId: string,
    status: BedStatus,
    notes?: string,
  ) {
    await this.findBedById(id, tenantId);
    await this.db.repo(Bed).update(id, { status, notes: notes ?? undefined });
    return this.db.repo(Bed).findOne({ where: { id }, relations: ['room'] });
  }

  async addBeds(roomId: string, tenantId: string, count: number) {
    const room = await this.findById(roomId, tenantId);

    const existingBeds = await this.db.repo(Bed).find({ where: { roomId } });
    const maxNum = existingBeds.reduce((max, b) => {
      const num = parseInt(b.bedNumber.replace(/\D/g, ''), 10) || 0;
      return Math.max(max, num);
    }, 0);

    const newBeds = Array.from({ length: count }, (_, i) =>
      this.db.repo(Bed).create({
        tenantId,
        roomId,
        bedNumber: `B${String(maxNum + i + 1).padStart(2, '0')}`,
        status: BedStatus.AVAILABLE,
      }),
    );

    await this.db.repo(Bed).save(newBeds);
    await this.db
      .repo(Room)
      .update(roomId, { totalBeds: room.totalBeds + count });

    return this.findById(roomId, tenantId);
  }

  async getOccupancySummary(tenantId: string) {
    const stats = await this.db
      .qb(Bed, 'bed')
      .select('bed.status', 'status')
      .addSelect('COUNT(bed.id)', 'count')
      .where('bed.tenantId = :tenantId', { tenantId })
      .groupBy('bed.status')
      .getRawMany<{ status: string; count: string }>();

    const result: Record<string, number> = {};
    for (const row of stats) result[row.status] = Number(row.count);

    const total = Object.values(result).reduce((a, b) => a + b, 0);
    const available = result[BedStatus.AVAILABLE] ?? 0;
    const occupied = result[BedStatus.OCCUPIED] ?? 0;

    return {
      total,
      available,
      occupied,
      other: total - available - occupied,
      byStatus: result,
    };
  }
}

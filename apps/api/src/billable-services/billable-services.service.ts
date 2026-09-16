import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { BillableService, TenantEntityManager } from '@mediflow/database';

export class CreateBillableServiceDto {
  name: string;
  code: string;
  category?: string;
  departmentId?: string;
  price: number;
  durationMinutes?: number;
  isTaxable?: boolean;
  gstPercent?: number;
  description?: string;
  sortOrder?: number;
}

export class UpdateBillableServiceDto {
  name?: string;
  category?: string;
  departmentId?: string;
  price?: number;
  durationMinutes?: number;
  isTaxable?: boolean;
  gstPercent?: number;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class BillableServicesService {
  constructor(private readonly db: TenantEntityManager) {}

  async create(tenantId: string, dto: CreateBillableServiceDto) {
    const existing = await this.db.repo(BillableService).findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Service with code '${dto.code}' already exists`,
      );
    }

    return this.db.repo(BillableService).save(
      this.db.repo(BillableService).create({
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        category: dto.category ?? null,
        departmentId: dto.departmentId ?? null,
        price: String(dto.price),
        durationMinutes: dto.durationMinutes ?? null,
        isTaxable: dto.isTaxable ?? true,
        gstPercent:
          dto.gstPercent !== undefined ? String(dto.gstPercent) : null,
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
      }),
    );
  }

  async findAll(tenantId: string) {
    return this.db
      .qb(BillableService, 'svc')
      .where('svc.tenantId = :tenantId', { tenantId })
      .andWhere('svc.isActive = true')
      .orderBy('svc.sortOrder', 'ASC')
      .addOrderBy('svc.name', 'ASC')
      .getMany();
  }

  async findById(id: string, tenantId: string) {
    const svc = await this.db
      .repo(BillableService)
      .findOne({ where: { id, tenantId } });
    if (!svc) throw new NotFoundException('Service not found');
    return svc;
  }

  async update(id: string, tenantId: string, dto: UpdateBillableServiceDto) {
    await this.findById(id, tenantId);

    await this.db.repo(BillableService).update(id, {
      name: dto.name ?? undefined,
      category: dto.category ?? undefined,
      departmentId: dto.departmentId ?? undefined,
      price: dto.price !== undefined ? String(dto.price) : undefined,
      durationMinutes: dto.durationMinutes ?? undefined,
      isTaxable: dto.isTaxable ?? undefined,
      gstPercent:
        dto.gstPercent !== undefined ? String(dto.gstPercent) : undefined,
      description: dto.description ?? undefined,
      sortOrder: dto.sortOrder ?? undefined,
      isActive: dto.isActive ?? undefined,
    });

    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.db.repo(BillableService).update(id, { isActive: false });
    return { deleted: true };
  }
}

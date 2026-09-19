import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { IsStrongPassword } from '@mediflow/shared';
import {
  User,
  DoctorProfile,
  StaffProfile,
  Role,
  TenantEntityManager,
} from '@mediflow/database';

const STAFF_ROLES: Role[] = [
  Role.NURSE,
  Role.RECEPTIONIST,
  Role.LAB_TECHNICIAN,
  Role.PHARMACIST,
];

export class CreateUserDto {
  @IsEmail() email: string;
  @IsStrongPassword() password: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() phone?: string;
  // Doctor-specific
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() subSpecialty?: string;
  @IsOptional() @IsString() qualification?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsNumber() consultationFee?: number;
  @IsOptional() @IsNumber() experienceYears?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  // Non-doctor staff-specific
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsString() shift?: string;
  @IsOptional() @IsString() specialization?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

export class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsStrongPassword() password?: string;
  // Doctor-specific
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() subSpecialty?: string;
  @IsOptional() @IsString() qualification?: string;
  @IsOptional() @IsString() registrationNo?: string;
  @IsOptional() @IsNumber() consultationFee?: number;
  @IsOptional() @IsNumber() experienceYears?: number;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsBoolean() isAcceptingPatients?: boolean;
  // Non-doctor staff-specific
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsString() shift?: string;
  @IsOptional() @IsString() specialization?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: TenantEntityManager) {}

  async findAll(
    tenantId: string,
    filters: { role?: Role; q?: string; isActive?: boolean },
    page = 1,
    limit = 50,
  ) {
    const qb = this.db
      .qb(User, 'user')
      .leftJoinAndSelect('user.doctorProfile', 'doctorProfile')
      .leftJoinAndSelect('user.staffProfile', 'staffProfile')
      .leftJoinAndSelect('staffProfile.department', 'staffDept')
      .leftJoinAndSelect('doctorProfile.department', 'doctorDept')
      .where('user.tenantId = :tenantId', { tenantId })
      .orderBy('user.firstName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.role) {
      qb.andWhere('user.role = :role', { role: filters.role });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }
    if (filters.q) {
      qb.andWhere(
        "(LOWER(user.firstName) LIKE :q OR LOWER(user.lastName) LIKE :q OR LOWER(user.email) LIKE :q OR LOWER(COALESCE(user.staffId, '')) LIKE :q)",
        { q: `%${filters.q.toLowerCase()}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, tenantId: string) {
    const user = await this.db.repo(User).findOne({
      where: { id, tenantId },
      relations: [
        'doctorProfile',
        'doctorProfile.department',
        'staffProfile',
        'staffProfile.department',
      ],
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private async generateStaffId(tenantId: string, role: Role): Promise<string> {
    const prefixes: Partial<Record<Role, string>> = {
      [Role.ADMIN]: 'ADM',
      [Role.DOCTOR]: 'DOC',
      [Role.NURSE]: 'NRS',
      [Role.RECEPTIONIST]: 'RCP',
      [Role.LAB_TECHNICIAN]: 'LAB',
      [Role.PHARMACIST]: 'PHM',
    };
    const prefix = prefixes[role] ?? 'STF';

    const last = await this.db
      .repo(User)
      .createQueryBuilder('u')
      .where('u.tenantId = :tenantId', { tenantId })
      .andWhere('u.staffId LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('u.staffId', 'DESC')
      .getOne();

    let next = 1;
    if (last?.staffId) {
      const num = parseInt(last.staffId.slice(prefix.length), 10);
      if (!isNaN(num)) next = num + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.db
      .repo(User)
      .findOne({ where: { tenantId, email: dto.email } });
    if (existing) {
      throw new ConflictException(
        `Email '${dto.email}' is already taken in this organisation`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const staffId =
      dto.role !== Role.SUPER_ADMIN
        ? await this.generateStaffId(tenantId, dto.role)
        : null;

    const user = await this.db.repo(User).save(
      this.db.repo(User).create({
        tenantId,
        email: dto.email,
        staffId,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        phone: dto.phone ?? null,
        isActive: true,
      }),
    );

    if (dto.role === Role.DOCTOR) {
      await this.db.repo(DoctorProfile).save(
        this.db.repo(DoctorProfile).create({
          userId: user.id,
          tenantId,
          specialty: dto.specialty ?? null,
          subSpecialty: dto.subSpecialty ?? null,
          qualification: dto.qualification ?? null,
          registrationNo: dto.registrationNo ?? null,
          consultationFee:
            dto.consultationFee != null ? String(dto.consultationFee) : null,
          experienceYears: dto.experienceYears ?? null,
          departmentId: dto.departmentId ?? null,
          isAcceptingPatients: true,
        }),
      );
    }

    if (STAFF_ROLES.includes(dto.role as Role)) {
      await this.db.repo(StaffProfile).save(
        this.db.repo(StaffProfile).create({
          userId: user.id,
          tenantId,
          employeeId: dto.employeeId ?? null,
          qualification: dto.qualification ?? null,
          registrationNo: dto.registrationNo ?? null,
          departmentId: dto.departmentId ?? null,
          joiningDate: dto.joiningDate ?? null,
          shift: dto.shift ?? null,
          experienceYears: dto.experienceYears ?? null,
          specialization: dto.specialization ?? null,
          metadata: dto.metadata ?? null,
          isActive: true,
        }),
      );
    }

    return this.findById(user.id, tenantId);
  }

  async assignStaffId(id: string, tenantId: string) {
    const user = await this.findById(id, tenantId);
    if (user.staffId) return user;
    const staffId = await this.generateStaffId(tenantId, user.role as Role);
    await this.db.repo(User).update(id, { staffId });
    return this.findById(id, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateUserDto,
    caller: { id: string; role: Role },
  ) {
    const user = await this.findById(id, tenantId);

    const isAdmin = caller.role === Role.ADMIN || caller.role === Role.SUPER_ADMIN;
    const isSelf = caller.id === id;

    // Any authenticated staff member could otherwise PATCH any other user in
    // the same tenant — including their password and isActive flag. Only an
    // ADMIN may edit someone else's account; everyone else may only edit
    // their own profile fields.
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException("You can only update your own profile");
    }

    // Self-service edits (any role, including ADMIN editing themselves) may
    // never change password or isActive through this generic endpoint:
    // password changes must go through /auth/change-password, which verifies
    // the current password first — this route has no such check, so allowing
    // it here would be a strictly weaker path to the same result. isActive
    // is an account-lifecycle control, not a self-service profile field.
    if (isSelf && (dto.password !== undefined || dto.isActive !== undefined)) {
      throw new ForbiddenException(
        "Use the change-password endpoint to change your own password; isActive can only be changed by an admin for another user's account",
      );
    }

    if (dto.email && dto.email !== user.email) {
      const conflict = await this.db
        .repo(User)
        .findOne({ where: { tenantId, email: dto.email } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Email '${dto.email}' is already taken`);
      }
    }

    const updateData: Partial<User> = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    if (Object.keys(updateData).length > 0) {
      await this.db.repo(User).update(id, updateData);
    }

    if (user.role === Role.DOCTOR) {
      const profileUpdate: any = {};
      if (dto.specialty !== undefined) profileUpdate.specialty = dto.specialty;
      if (dto.subSpecialty !== undefined)
        profileUpdate.subSpecialty = dto.subSpecialty;
      if (dto.qualification !== undefined)
        profileUpdate.qualification = dto.qualification;
      if (dto.registrationNo !== undefined)
        profileUpdate.registrationNo = dto.registrationNo;
      if (dto.consultationFee !== undefined)
        profileUpdate.consultationFee = String(dto.consultationFee);
      if (dto.experienceYears !== undefined)
        profileUpdate.experienceYears = dto.experienceYears;
      if (dto.departmentId !== undefined)
        profileUpdate.departmentId = dto.departmentId;
      if (dto.isAcceptingPatients !== undefined)
        profileUpdate.isAcceptingPatients = dto.isAcceptingPatients;

      if (Object.keys(profileUpdate).length > 0) {
        await this.db.repo(DoctorProfile).update({ userId: id }, profileUpdate);
      }
    }

    if (STAFF_ROLES.includes(user.role as Role)) {
      const profileUpdate: any = {};
      if (dto.employeeId !== undefined)
        profileUpdate.employeeId = dto.employeeId;
      if (dto.qualification !== undefined)
        profileUpdate.qualification = dto.qualification;
      if (dto.registrationNo !== undefined)
        profileUpdate.registrationNo = dto.registrationNo;
      if (dto.departmentId !== undefined)
        profileUpdate.departmentId = dto.departmentId;
      if (dto.joiningDate !== undefined)
        profileUpdate.joiningDate = dto.joiningDate;
      if (dto.shift !== undefined) profileUpdate.shift = dto.shift;
      if (dto.experienceYears !== undefined)
        profileUpdate.experienceYears = dto.experienceYears;
      if (dto.specialization !== undefined)
        profileUpdate.specialization = dto.specialization;
      if (dto.isActive !== undefined) profileUpdate.isActive = dto.isActive;
      if (dto.metadata !== undefined) profileUpdate.metadata = dto.metadata;

      if (Object.keys(profileUpdate).length > 0) {
        const existing = await this.db
          .repo(StaffProfile)
          .findOne({ where: { userId: id } });
        if (existing) {
          await this.db
            .repo(StaffProfile)
            .update({ userId: id }, profileUpdate);
        } else {
          await this.db.repo(StaffProfile).save(
            this.db.repo(StaffProfile).create({
              userId: id,
              tenantId: user.tenantId,
              ...profileUpdate,
            }),
          );
        }
      }
    }

    return this.findById(id, tenantId);
  }
}

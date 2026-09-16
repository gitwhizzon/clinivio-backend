import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import { Role } from '@mediflow/database';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List users (filter by role, search)' })
  findAll(
    @TenantId() tenantId: string,
    @Query('role') role?: Role,
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    const activeFilter =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.svc.findAll(
      tenantId,
      { role, q, isActive: activeFilter },
      page,
      limit,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create user (staff member)' })
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.svc.create(tenantId, dto);
  }

  @Post(':id/assign-staff-id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Assign a Staff ID to an existing user who does not have one',
  })
  assignStaffId(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.assignStaffId(id, tenantId);
  }

  @Patch(':id')
  @Roles(
    'ADMIN',
    'SUPER_ADMIN',
    'DOCTOR',
    'NURSE',
    'RECEPTIONIST',
    'PHARMACIST',
    'LAB_TECHNICIAN',
  )
  @ApiOperation({ summary: 'Update user profile or password' })
  update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(id, tenantId, dto);
  }
}

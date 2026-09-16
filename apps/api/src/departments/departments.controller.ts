import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import {
  DepartmentsService,
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './departments.service';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private svc: DepartmentsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create department' })
  create(@TenantId() tenantId: string, @Body() dto: CreateDepartmentDto) {
    return this.svc.create(tenantId, dto);
  }

  @Post('seed-defaults')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Seed default departments for this tenant' })
  seedDefaults(@TenantId() tenantId: string) {
    return this.svc.seedDefaults(tenantId);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'List departments' })
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get department by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update department' })
  update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.svc.update(id, tenantId, dto);
  }
}

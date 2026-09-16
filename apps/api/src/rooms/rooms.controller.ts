import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import { BedStatus } from '@mediflow/database';
import { RoomsService, CreateRoomDto, UpdateRoomDto } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private svc: RoomsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create room with beds' })
  create(@TenantId() tenantId: string, @Body() dto: CreateRoomDto) {
    return this.svc.create(tenantId, dto);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'List rooms' })
  findAll(@TenantId() tenantId: string, @Query('type') type?: string) {
    return this.svc.findAll(tenantId, type);
  }

  @Get('occupancy')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  @ApiOperation({ summary: 'Get bed occupancy summary' })
  occupancy(@TenantId() tenantId: string) {
    return this.svc.getOccupancySummary(tenantId);
  }

  @Get('beds')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'List beds (optionally by room or status)' })
  findBeds(
    @TenantId() tenantId: string,
    @Query('roomId') roomId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.findBeds(tenantId, roomId, status as any);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get room by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update room' })
  update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.svc.update(id, tenantId, dto);
  }

  @Patch('beds/:bedId/status')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  @ApiOperation({ summary: 'Update bed status' })
  updateBedStatus(
    @Param('bedId') bedId: string,
    @TenantId() tenantId: string,
    @Body('status') status: string,
    @Body('notes') notes?: string,
  ) {
    return this.svc.updateBedStatus(bedId, tenantId, status as any, notes);
  }

  /** PATCH /rooms/beds/:bedId/available — shorthand to mark bed as AVAILABLE */
  @Patch('beds/:bedId/available')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  @ApiOperation({ summary: 'Mark bed as available' })
  markAvailable(@Param('bedId') bedId: string, @TenantId() tenantId: string) {
    return this.svc.updateBedStatus(bedId, tenantId, BedStatus.AVAILABLE);
  }

  /** PATCH /rooms/beds/:bedId/maintenance — shorthand to mark bed as UNDER_MAINTENANCE */
  @Patch('beds/:bedId/maintenance')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  @ApiOperation({ summary: 'Mark bed as under maintenance' })
  markMaintenance(
    @Param('bedId') bedId: string,
    @TenantId() tenantId: string,
    @Body('notes') notes?: string,
  ) {
    return this.svc.updateBedStatus(
      bedId,
      tenantId,
      BedStatus.UNDER_MAINTENANCE,
      notes,
    );
  }

  @Post(':id/beds')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add more beds to a room' })
  addBeds(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('count') count: number,
  ) {
    return this.svc.addBeds(id, tenantId, count);
  }
}

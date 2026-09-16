import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import {
  SlotsService,
  CreateSlotDto,
  CreateSlotsBulkDto,
} from './slots.service';

@ApiTags('Slots')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('slots')
export class SlotsController {
  constructor(private svc: SlotsService) {}

  @Post()
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create a single slot' })
  create(@TenantId() tenantId: string, @Body() dto: CreateSlotDto) {
    return this.svc.createSlot(tenantId, dto);
  }

  @Post('bulk')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create slots in bulk for a date range' })
  createBulk(@TenantId() tenantId: string, @Body() dto: CreateSlotsBulkDto) {
    return this.svc.createSlotsBulk(tenantId, dto);
  }

  @Get('available')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get available slots for a doctor on a date' })
  available(
    @TenantId() tenantId: string,
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.svc.findAvailableSlots(tenantId, doctorId, date);
  }

  @Get('doctors-availability')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Get availability for all doctors on a date' })
  doctorsAvailability(
    @TenantId() tenantId: string,
    @Query('date') date: string,
  ) {
    return this.svc.findDoctorsAvailability(tenantId, date);
  }

  @Get('by-doctor/:doctorId')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR')
  @ApiOperation({
    summary: 'Get all slots for a doctor (with optional date range)',
  })
  byDoctor(
    @TenantId() tenantId: string,
    @Param('doctorId') doctorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findDoctorSlots(tenantId, doctorId, from, to);
  }

  @Post(':id/block')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Block a slot' })
  block(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('reason') reason?: string,
  ) {
    return this.svc.blockSlot(id, tenantId, reason);
  }

  @Post(':id/unblock')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Unblock a slot' })
  unblock(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.unblockSlot(id, tenantId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Delete a slot' })
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.deleteSlot(id, tenantId);
  }
}

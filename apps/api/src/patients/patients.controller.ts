import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private svc: PatientsService) {}

  @Post()
  @Roles('ADMIN', 'RECEPTIONIST')
  create(@TenantId() tenantId: string, @Body() dto: CreatePatientDto) {
    return this.svc.create(tenantId, dto);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  findAll(
    @TenantId() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.findAll(tenantId, page, limit);
  }

  @Get('search')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  search(
    @TenantId() tenantId: string,
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.search(tenantId, q || '', page, limit);
  }

  @Get('by-phone/:phone')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR')
  findByPhone(@Param('phone') phone: string, @TenantId() tenantId: string) {
    return this.svc.findByPhone(phone, tenantId);
  }

  @Get('family/by-whatsapp/:phone')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  findFamilyByWhatsapp(
    @Param('phone') phone: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.findFamilyByWhatsapp(phone, tenantId);
  }

  @Get('family/:familyId/members')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  findByFamily(
    @Param('familyId') familyId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.findByFamily(familyId, tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTIONIST')
  update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.svc.update(id, tenantId, dto);
  }

  @Patch(':id/conditions')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'Update patient condition tags (chronic conditions)',
  })
  updateConditions(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('conditions') conditions: string[],
  ) {
    return this.svc.updateConditions(id, tenantId, conditions ?? []);
  }

  @Post(':id/consent')
  @Roles('ADMIN', 'RECEPTIONIST')
  updateConsent(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.updateConsent(id, tenantId);
  }

  /**
   * GET /patients/:id/history
   * Used by the consultation page to load past consultation history for a patient.
   * Delegates to PatientsService → returns appointments with consultations.
   */
  @Get(':id/history')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  getHistory(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.getConsultationHistory(id, tenantId, page, limit);
  }
}

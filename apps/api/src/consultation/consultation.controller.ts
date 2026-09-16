import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import {
  ConsultationService,
  SaveConsultationDto,
  CreatePrescriptionDto,
  CreateFollowUpDto,
} from './consultation.service';

@ApiTags('Consultation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('consultations')
export class ConsultationController {
  constructor(private svc: ConsultationService) {}

  @Get('by-appointment/:appointmentId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get or create consultation for an appointment' })
  getOrCreate(
    @Param('appointmentId') appointmentId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.getOrCreate(appointmentId, tenantId);
  }

  @Patch('by-appointment/:appointmentId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Save consultation notes and vitals' })
  save(
    @Param('appointmentId') appointmentId: string,
    @TenantId() tenantId: string,
    @Body() dto: SaveConsultationDto,
  ) {
    return this.svc.saveConsultation(appointmentId, tenantId, dto);
  }

  @Post('by-appointment/:appointmentId/prescription')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Create prescription for an appointment' })
  createPrescription(
    @Param('appointmentId') appointmentId: string,
    @TenantId() tenantId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.svc.createPrescription(appointmentId, tenantId, dto);
  }

  @Patch('prescriptions/:prescriptionId')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Update prescription' })
  updatePrescription(
    @Param('prescriptionId') prescriptionId: string,
    @TenantId() tenantId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.svc.updatePrescription(prescriptionId, tenantId, dto);
  }

  @Post('by-appointment/:appointmentId/follow-up')
  @Roles('ADMIN', 'DOCTOR', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create follow-up for an appointment' })
  createFollowUp(
    @Param('appointmentId') appointmentId: string,
    @TenantId() tenantId: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.svc.createFollowUp(appointmentId, tenantId, dto);
  }

  @Post('follow-ups/:followUpId/complete')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Mark follow-up as complete' })
  completeFollowUp(
    @Param('followUpId') followUpId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.completeFollowUp(followUpId, tenantId);
  }

  @Get('by-patient/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get consultation history for a patient' })
  getByPatient(
    @Param('patientId') patientId: string,
    @TenantId() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.getPatientConsultations(patientId, tenantId, page, limit);
  }
}

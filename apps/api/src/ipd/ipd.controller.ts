import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId, CurrentUser } from '@mediflow/shared';
import {
  IpdService,
  AdmitPatientDto,
  AddVitalSnapshotDto,
  AddTreatmentDto,
  AddProcedureDto,
  SaveDischargeAdviceDto,
  SaveDischargeSummaryDto,
} from './ipd.service';

/**
 * The frontend calls /ipd/admissions/* paths. We expose both:
 *  - /ipd/admissions/* (frontend shape)
 *  - /ipd/*            (canonical REST shape)
 *
 * Both delegate to the same IpdService methods.
 */

@ApiTags('IPD')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('ipd')
export class IpdController {
  constructor(private svc: IpdService) {}

  // ─── Admission list ────────────────────────────────────────────────────────
  // GET /ipd/admissions  AND  GET /ipd

  @Get('admissions')
  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'List IPD admissions' })
  findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.svc.findAll(
      tenantId,
      { status: status as any, patientId },
      page,
      limit,
    );
  }

  // ─── Admit patient ─────────────────────────────────────────────────────────
  // POST /ipd/admissions  AND  POST /ipd/admit

  @Post('admissions')
  @Post('admit')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Admit a patient' })
  admit(@TenantId() tenantId: string, @Body() dto: AdmitPatientDto) {
    return this.svc.admitPatient(tenantId, dto);
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  @Get('admissions/:id')
  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get IPD admission by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  // ─── Ready for discharge flag ──────────────────────────────────────────────
  // PATCH /ipd/admissions/:id/ready-for-discharge  (frontend)

  @Patch('admissions/:id/ready-for-discharge')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Mark patient as ready for discharge' })
  readyForDischarge(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.markReadyForDischarge(id, tenantId);
  }

  // ─── Discharge ─────────────────────────────────────────────────────────────
  // PATCH /ipd/admissions/:id/discharge  AND  POST /ipd/:id/discharge

  @Patch('admissions/:id/discharge')
  @Post(':id/discharge')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Discharge a patient' })
  discharge(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.dischargePatient(id, tenantId);
  }

  // ─── Vitals ────────────────────────────────────────────────────────────────

  @Post('admissions/:id/vitals')
  @Post(':id/vitals')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Add vital snapshot' })
  addVitals(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: AddVitalSnapshotDto,
  ) {
    dto.recordedById = dto.recordedById ?? user.sub;
    return this.svc.addVitalSnapshot(id, tenantId, dto);
  }

  @Get('admissions/:id/vitals')
  @Get(':id/vitals')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get vitals for admission' })
  getVitals(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getVitals(id, tenantId);
  }

  // ─── Treatments ────────────────────────────────────────────────────────────

  @Post('admissions/:id/treatments')
  @Post(':id/treatments')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Add treatment order' })
  addTreatment(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: AddTreatmentDto,
  ) {
    dto.orderedById = dto.orderedById ?? user.sub;
    return this.svc.addTreatment(id, tenantId, dto);
  }

  @Get('admissions/:id/treatments')
  @Get(':id/treatments')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get treatments for admission' })
  getTreatments(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getTreatments(id, tenantId);
  }

  /** PATCH /ipd/treatments/:id — stop a treatment (frontend sends isActive: false) */
  @Patch('treatments/:treatmentId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'End/update a treatment' })
  endTreatment(
    @Param('treatmentId') treatmentId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.endTreatment(treatmentId, tenantId);
  }

  @Post('treatments/:treatmentId/end')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  endTreatmentPost(
    @Param('treatmentId') treatmentId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.endTreatment(treatmentId, tenantId);
  }

  // ─── Procedures ────────────────────────────────────────────────────────────

  @Post('admissions/:id/procedures')
  @Post(':id/procedures')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Add procedure record' })
  addProcedure(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: AddProcedureDto,
  ) {
    dto.performedById = dto.performedById ?? user.sub;
    return this.svc.addProcedure(id, tenantId, dto);
  }

  @Get('admissions/:id/procedures')
  @Get(':id/procedures')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get procedures for admission' })
  getProcedures(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getProcedures(id, tenantId);
  }

  /** PATCH /ipd/procedures/:id/photos — attach photo URLs to procedure */
  @Patch('procedures/:procedureId/photos')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Add photos to procedure' })
  addProcedurePhotos(
    @Param('procedureId') procedureId: string,
    @TenantId() tenantId: string,
    @Body('photoUrls') photoUrls: string[],
  ) {
    return this.svc.addProcedurePhotos(procedureId, tenantId, photoUrls);
  }

  // ─── Discharge advice & summary ────────────────────────────────────────────

  @Post('admissions/:id/discharge-advice')
  @Post(':id/discharge-advice')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Save discharge advice' })
  saveDischargeAdvice(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: SaveDischargeAdviceDto,
  ) {
    dto.createdById = dto.createdById ?? user.sub;
    return this.svc.saveDischargeAdvice(id, tenantId, dto);
  }

  @Post('admissions/:id/discharge-summary')
  @Post(':id/discharge-summary')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Save discharge summary' })
  saveDischargeSummary(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: SaveDischargeSummaryDto,
  ) {
    dto.generatedById = dto.generatedById ?? user.sub;
    return this.svc.saveDischargeSummary(id, tenantId, dto);
  }
}

import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import { AnalyticsService, COMMON_CONDITIONS } from './analytics.service';

class PrescriptionSuggestionsDto {
  @IsArray() @IsString({ each: true }) conditions: string[];
  @IsString() diagnosis: string;
  @IsOptional() @IsString() observations?: string;
  @IsOptional() @IsNumber() ageInYears?: number;
  @IsOptional() @IsString() gender?: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('conditions')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Patient condition distribution across the tenant' })
  conditionDistribution(
    @TenantId() tenantId: string,
    @Query('mine') mine: string,
    @Request() req: any,
  ) {
    const doctorId =
      mine === 'true' ? (req.user?.sub ?? req.user?.id) : undefined;
    return this.svc.getConditionDistribution(tenantId, doctorId);
  }

  @Get('medicine-patterns')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'Top prescribed medicines — optionally filtered by condition',
  })
  medicinePatterns(
    @TenantId() tenantId: string,
    @Query('condition') condition?: string,
    @Query('mine') mine?: string,
    @Request() req?: any,
  ) {
    const doctorId =
      mine === 'true' ? (req?.user?.sub ?? req?.user?.id) : undefined;
    return this.svc.getMedicinePatterns(tenantId, condition, doctorId);
  }

  @Get('vital-trends')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'Average vital statistics for patients with a given condition',
  })
  vitalTrends(
    @TenantId() tenantId: string,
    @Query('condition') condition: string,
    @Query('mine') mine?: string,
    @Request() req?: any,
  ) {
    const doctorId =
      mine === 'true' ? (req?.user?.sub ?? req?.user?.id) : undefined;
    return this.svc.getVitalTrends(tenantId, condition, doctorId);
  }

  @Get('ai-insights')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'AI-generated population-level insights (cached 6h)',
  })
  aiInsights(
    @TenantId() tenantId: string,
    @Request() req: any,
    @Query('mine') mine?: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    const doctorId = mine === 'true' ? userId : undefined;
    return this.svc.getAiInsights(tenantId, userId, doctorId);
  }

  @Get('my-stats')
  @Roles('DOCTOR')
  @ApiOperation({
    summary: "Doctor's own consultation, prescription and patient counts",
  })
  myStats(@TenantId() tenantId: string, @Request() req: any) {
    const doctorId = req.user?.sub ?? req.user?.id;
    return this.svc.getDoctorStats(tenantId, doctorId);
  }

  @Get('common-conditions')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Master list of common condition tags' })
  commonConditions() {
    return { conditions: COMMON_CONDITIONS };
  }

  @Post('prescription-suggestions')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'AI-powered prescription suggestions based on patient conditions',
  })
  prescriptionSuggestions(
    @TenantId() tenantId: string,
    @Body() dto: PrescriptionSuggestionsDto,
  ) {
    return this.svc.getPrescriptionSuggestions(
      '',
      tenantId,
      dto.conditions ?? [],
      dto.diagnosis ?? '',
      dto.observations,
      dto.ageInYears,
      dto.gender,
    );
  }

  @Get('age-distribution')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Patient age group distribution' })
  ageDistribution(
    @TenantId() tenantId: string,
    @Query('mine') mine?: string,
    @Request() req?: any,
  ) {
    const doctorId =
      mine === 'true' ? (req?.user?.sub ?? req?.user?.id) : undefined;
    return this.svc.getAgeDistribution(tenantId, doctorId);
  }

  @Get('lab-summary')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'Lab order volume, top tests, completion and abnormal rates',
  })
  labSummary(
    @TenantId() tenantId: string,
    @Query('days') daysStr?: string,
    @Query('mine') mine?: string,
    @Request() req?: any,
  ) {
    const doctorId =
      mine === 'true' ? (req?.user?.sub ?? req?.user?.id) : undefined;
    const days = daysStr ? parseInt(daysStr, 10) : 90;
    return this.svc.getLabSummary(tenantId, doctorId, isNaN(days) ? 90 : days);
  }

  @Get('patient-trends/:patientId')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({
    summary: 'Single-patient vitals timeline and lab results history',
  })
  patientTrends(
    @Param('patientId') patientId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.getPatientTrends(patientId, tenantId);
  }
}

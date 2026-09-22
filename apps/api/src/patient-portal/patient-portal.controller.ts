import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import {
  authCookieOptions,
  PATIENT_ACCESS_TOKEN_COOKIE,
} from '@mediflow/shared';
import { TenantDataSourceRegistry } from '@mediflow/database';
import { PatientPortalService } from './patient-portal.service';
import {
  PatientRegisterDto,
  PatientLoginDto,
  UpdatePatientProfileDto,
  BookAppointmentDto,
  RequestOtpDto,
  VerifyOtpDto,
  CreatePaymentOrderDto,
  VerifyPaymentDto,
} from './dto/patient-portal.dto';

const PatientJwtGuard = () => UseGuards(AuthGuard('patient-jwt'));

@ApiTags('Patient Portal')
@Controller('patient-portal')
export class PatientPortalController {
  constructor(
    private readonly svc: PatientPortalService,
    private readonly registry: TenantDataSourceRegistry,
  ) {}

  // ── Auth ─────────────────────────────────────────────────────────────────────

  private setPatientAuthCookie(res: Response, accessToken: string) {
    res.cookie(
      PATIENT_ACCESS_TOKEN_COOKIE,
      accessToken,
      authCookieOptions('/'),
    );
  }

  @Post('auth/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Self-register a patient account' })
  async register(
    @Body() dto: PatientRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.register(dto);
    this.setPatientAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone + password' })
  async login(
    @Body() dto: PatientLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.login(dto);
    this.setPatientAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('auth/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a 6-digit OTP via SMS (rate-limited: 3/hour)',
  })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.svc.requestOtp(dto);
  }

  @Post('auth/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and receive a JWT access token' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.svc.verifyOtp(dto);
    this.setPatientAuthCookie(res, result.accessToken);
    return result;
  }

  // ── Profile ───────────────────────────────────────────────────────────────────

  @Get('me')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own patient profile' })
  getProfile(@Request() req: any) {
    return this.svc.getProfile(req.user.patientId, req.user.tenantId);
  }

  @Patch('me')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own patient profile' })
  updateProfile(@Request() req: any, @Body() dto: UpdatePatientProfileDto) {
    return this.svc.updateProfile(req.user.patientId, req.user.tenantId, dto);
  }

  // ── Appointments ──────────────────────────────────────────────────────────────

  @Get('appointments')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List own appointments' })
  getAppointments(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.svc.getAppointments(
      req.user.patientId,
      req.user.tenantId,
      page,
      limit,
    );
  }

  @Post('appointments')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a new appointment' })
  bookAppointment(@Request() req: any, @Body() dto: BookAppointmentDto) {
    return this.svc.bookAppointment(req.user.patientId, req.user.tenantId, dto);
  }

  @Delete('appointments/:id')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an appointment' })
  cancelAppointment(@Param('id') id: string, @Request() req: any) {
    return this.svc.cancelAppointment(
      id,
      req.user.patientId,
      req.user.tenantId,
    );
  }

  // ── Consultations ─────────────────────────────────────────────────────────────

  @Get('consultations')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List own consultations with prescriptions' })
  getConsultations(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.svc.getConsultations(
      req.user.patientId,
      req.user.tenantId,
      page,
      limit,
    );
  }

  // ── Lab Results ───────────────────────────────────────────────────────────────

  @Get('lab-results')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List own lab results' })
  getLabResults(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.svc.getLabResults(
      req.user.patientId,
      req.user.tenantId,
      page,
      limit,
    );
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  @Get('invoices')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List own invoices' })
  getInvoices(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.svc.getInvoices(
      req.user.patientId,
      req.user.tenantId,
      page,
      limit,
    );
  }

  // ── Payments ──────────────────────────────────────────────────────────────────

  @Post('payments/create-order')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a Razorpay order for an unpaid invoice' })
  createPaymentOrder(@Request() req: any, @Body() dto: CreatePaymentOrderDto) {
    return this.svc.createPaymentOrder(
      dto,
      req.user.patientId,
      req.user.tenantId,
    );
  }

  @Post('payments/verify')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Razorpay payment and mark invoice as paid' })
  verifyPayment(@Request() req: any, @Body() dto: VerifyPaymentDto) {
    return this.svc.verifyPayment(dto, req.user.patientId, req.user.tenantId);
  }

  // ── Discovery (public — for booking flow) ─────────────────────────────────────

  @Get('public/hospital-profile')
  @ApiOperation({
    summary: 'Hospital branding shown on the tenant login page (requires X-Tenant-Slug header)',
  })
  getHospitalProfile() {
    return this.svc.getHospitalProfile(this.registry.currentTenantId ?? '');
  }

  @Get('public/doctors')
  @ApiOperation({
    summary: 'List available doctors (requires X-Tenant-Slug header)',
  })
  getDoctors() {
    // TenantContextMiddleware resolves X-Tenant-Slug into the current
    // AsyncLocalStorage tenant context (registry.currentTenantId) — req.tenantId
    // is never actually set on the Express request, and req.headers['x-tenant-id']
    // is never sent by the frontend, so reading either always returned undefined.
    return this.svc.getDoctors(this.registry.currentTenantId ?? '');
  }

  @Get('public/departments')
  @ApiOperation({ summary: 'List departments (requires X-Tenant-Slug header)' })
  getDepartments() {
    return this.svc.getDepartments(this.registry.currentTenantId ?? '');
  }

  @Get('public/slots')
  @ApiOperation({ summary: 'Get available slots for a doctor on a date' })
  getSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.svc.getAvailableSlots(this.registry.currentTenantId ?? '', doctorId, date);
  }

  // ── Discovery (authenticated — tenantId from JWT) ─────────────────────────────

  @Get('doctors')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available doctors' })
  getDoctorsAuth(@Request() req: any) {
    return this.svc.getDoctors(req.user.tenantId);
  }

  @Get('departments')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List departments' })
  getDepartmentsAuth(@Request() req: any) {
    return this.svc.getDepartments(req.user.tenantId);
  }

  @Get('slots')
  @PatientJwtGuard()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available slots for a doctor on a date' })
  getSlotsAuth(
    @Request() req: any,
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    return this.svc.getAvailableSlots(req.user.tenantId, doctorId, date);
  }
}

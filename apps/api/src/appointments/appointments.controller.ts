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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AppointmentsService } from "./appointments.service";
import { ConsultationService } from "../consultation/consultation.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles, TenantId, CurrentUser } from "@mediflow/shared";
import { AppointmentStatus } from "@mediflow/database";

@ApiTags("Appointments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private svc: AppointmentsService,
    private consultationSvc: ConsultationService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({ summary: "Create appointment" })
  create(@TenantId() tenantId: string, @Body() dto: CreateAppointmentDto) {
    return this.svc.create(tenantId, dto);
  }

  // ─── List / Search ───────────────────────────────────────────────────────────

  @Get()
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "List appointments (paginated)" })
  findAll(
    @TenantId() tenantId: string,
    @Query("doctorId") doctorId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("patientId") patientId?: string,
    @Query("status") status?: AppointmentStatus,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.svc.findAll(
      tenantId,
      { doctorId, departmentId, patientId, status, from, to },
      page,
      limit,
    );
  }

  @Get("active")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "Get active patients for the day" })
  getActivePatients(
    @TenantId() tenantId: string,
    @Query("doctorId") doctorId?: string,
    @Query("departmentId") departmentId?: string,
    @Query("visitType") visitType?: string,
    @Query("date") date?: string,
    @Query("paymentStatus") paymentStatus?: string,
  ) {
    return this.svc.getActivePatients(tenantId, {
      doctorId,
      departmentId,
      date,
      paymentStatus: paymentStatus as any,
    });
  }

  /** GET /appointments/queue/status — used by doctor-queue page */
  @Get("queue/status")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({
    summary: "Get queue status (doctor-scoped for DOCTOR; all for NURSE)",
  })
  getQueueStatus(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Query("doctorId") doctorId?: string,
  ) {
    // Nurses see the whole-day queue; doctors see only their own patients
    const resolvedDoctorId =
      doctorId ?? (user.role === "NURSE" ? null : user.sub);
    return this.svc.getQueueStatus(resolvedDoctorId, tenantId);
  }

  /** GET /appointments/queue-status — alternate path kept for compatibility */
  @Get("queue-status")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  getQueueStatusAlt(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Query("doctorId") doctorId?: string,
  ) {
    const resolvedDoctorId =
      doctorId ?? (user.role === "NURSE" ? null : user.sub);
    return this.svc.getQueueStatus(resolvedDoctorId, tenantId);
  }

  /** GET /appointments/doctor-queue — today's queue for the logged-in doctor or nurse */
  @Get("doctor-queue")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({
    summary:
      "Doctor: own queue. Nurse: all active patients across all doctors today.",
  })
  getDoctorQueue(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Query("doctorId") doctorId?: string,
    @Query("date") date?: string,
  ) {
    const resolvedDoctorId =
      doctorId ?? (user.role === "NURSE" ? null : user.sub);
    const statuses =
      user.role === "NURSE"
        ? [
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.CHECKED_IN,
            AppointmentStatus.IN_PROGRESS,
          ]
        : undefined;
    return this.svc.findDoctorQueue(resolvedDoctorId, tenantId, date, statuses);
  }

  // ─── Get by ID ───────────────────────────────────────────────────────────────

  @Get(":id")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE", "PHARMACIST")
  @ApiOperation({ summary: "Get appointment by ID" })
  findById(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  // ─── Consultation sub-routes (nested under /appointments/:id) ────────────────
  // The frontend calls these paths so we expose them here and delegate to
  // ConsultationService (which is provided via the AppointmentsModule).

  @Get(":id/consultation")
  @Roles("ADMIN", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "Get consultation for appointment" })
  getConsultation(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.consultationSvc.getConsultationByAppointment(id, tenantId);
  }

  @Post(":id/consultation")
  @Roles("ADMIN", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "Save consultation notes & vitals" })
  saveConsultation(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: any,
  ) {
    return this.consultationSvc.saveConsultation(id, tenantId, dto);
  }

  @Post(":id/consultation/prescription")
  @Roles("ADMIN", "DOCTOR")
  @ApiOperation({ summary: "Create prescription for appointment" })
  createPrescription(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: any,
  ) {
    return this.consultationSvc.createPrescription(id, tenantId, dto);
  }

  @Post(":id/consultation/follow-up")
  @Roles("ADMIN", "DOCTOR", "RECEPTIONIST")
  @ApiOperation({ summary: "Create follow-up for appointment" })
  createFollowUp(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: any,
  ) {
    return this.consultationSvc.createFollowUp(id, tenantId, dto);
  }

  // ─── Action routes ────────────────────────────────────────────────────────
  // NOTE: Do NOT stack @Patch + @Post on the same handler. TypeScript applies
  // method decorators bottom-to-top, so the TOP decorator is applied LAST and
  // overwrites the bottom one. Only one HTTP method ends up registered.
  // The frontend uses POST for all action routes, so use @Post only here.

  @Post(":id/confirm-payment")
  @Roles("ADMIN", "RECEPTIONIST")
  @ApiOperation({ summary: "Confirm (full or partial) payment" })
  confirmPayment(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body()
    body: {
      paymentMethod: string;
      amount: number;
      razorpayPaymentId?: string;
      lineItems?: { description: string; amount: number; discount?: number }[];
      discountType?: string;
      discountValue?: number;
    },
    @CurrentUser() user: any,
  ) {
    return this.svc.confirmPayment(
      id,
      tenantId,
      body.paymentMethod,
      body.amount,
      body.razorpayPaymentId,
      {
        lineItems: body.lineItems,
        discountType: body.discountType as any,
        discountValue: body.discountValue,
        collectedByUserId: user?.sub,
      },
    );
  }

  @Post(":id/check-in")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({ summary: "Check in the patient (CONFIRMED → CHECKED_IN)" })
  checkIn(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.checkIn(id, tenantId);
  }

  @Post(":id/undo-check-in")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({
    summary: "Reverse an accidental check-in (CHECKED_IN → CONFIRMED)",
  })
  undoCheckIn(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.undoCheckIn(id, tenantId);
  }

  @Post(":id/start")
  @Roles("DOCTOR")
  @ApiOperation({ summary: "Start consultation (CHECKED_IN → IN_PROGRESS)" })
  startConsultation(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.startConsultation(id, tenantId);
  }

  /** PATCH alias kept for REST API clients */
  @Patch(":id/start-consultation")
  @Roles("DOCTOR")
  startConsultationPatch(
    @Param("id") id: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.startConsultation(id, tenantId);
  }

  @Post(":id/complete")
  @Roles("DOCTOR")
  @ApiOperation({ summary: "Complete the appointment" })
  complete(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.complete(id, tenantId);
  }

  @Post(":id/send-to-pharmacy")
  @Roles("DOCTOR", "NURSE", "RECEPTIONIST")
  @ApiOperation({ summary: "Send to pharmacy" })
  sendToPharmacy(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.sendToPharmacy(id, tenantId);
  }

  @Post(":id/cancel")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({ summary: "Cancel or mark no-show" })
  cancel(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() body: { reason: string; cancelStatus?: string },
  ) {
    return this.svc.cancel(
      id,
      tenantId,
      body.reason,
      body.cancelStatus as AppointmentStatus,
    );
  }

  /** GET /appointments/:id/queue — legacy: doctor queue by doctor ID */
  @Get(":id/queue")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  findDoctorQueueById(
    @Param("id") doctorId: string,
    @TenantId() tenantId: string,
    @Query("date") date?: string,
  ) {
    return this.svc.findDoctorQueue(doctorId, tenantId, date);
  }
}

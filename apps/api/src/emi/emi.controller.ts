import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard, Roles, TenantId, CurrentUser } from "@mediflow/shared";
import {
  EmiService,
  CreateEmiPlanDto,
  CollectInstallmentDto,
  CancelEmiPlanDto,
} from "./emi.service";

@ApiTags("EMI")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("emi")
export class EmiController {
  constructor(private svc: EmiService) {}

  @Post("plans")
  @Roles("ADMIN", "RECEPTIONIST")
  @ApiOperation({ summary: "Convert an invoice balance into an EMI plan" })
  createPlan(
    @TenantId() tenantId: string,
    @Body() dto: CreateEmiPlanDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.createPlan(tenantId, dto, user?.sub);
  }

  @Get("plans")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({ summary: "List EMI plans (active or history)" })
  findAll(@TenantId() tenantId: string, @Query("status") status?: string) {
    return status === "history"
      ? this.svc.findHistory(tenantId)
      : this.svc.findActivePlans(tenantId);
  }

  @Get("plans/:id")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR")
  @ApiOperation({ summary: "Get EMI plan detail" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.findPlanById(tenantId, id);
  }

  @Post("plans/:id/installments/:installmentId/collect")
  @Roles("ADMIN", "RECEPTIONIST")
  @ApiOperation({ summary: "Collect one installment payment" })
  collectInstallment(
    @Param("id") id: string,
    @Param("installmentId") installmentId: string,
    @TenantId() tenantId: string,
    @Body() dto: CollectInstallmentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.collectInstallment(
      tenantId,
      id,
      installmentId,
      dto,
      user?.sub,
    );
  }

  @Post("plans/:id/cancel")
  @Roles("ADMIN", "RECEPTIONIST")
  @ApiOperation({ summary: "Cancel an active EMI plan (no auto-refund)" })
  cancelPlan(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: CancelEmiPlanDto,
  ) {
    return this.svc.cancelPlan(tenantId, id, dto);
  }
}

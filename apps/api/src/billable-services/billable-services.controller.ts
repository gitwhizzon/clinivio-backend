import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard, Roles, TenantId } from "@mediflow/shared";
import {
  BillableServicesService,
  CreateBillableServiceDto,
  UpdateBillableServiceDto,
} from "./billable-services.service";

@ApiTags("Billable Services")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("billable-services")
export class BillableServicesController {
  constructor(private svc: BillableServicesService) {}

  @Post()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Create a billable service" })
  create(@TenantId() tenantId: string, @Body() dto: CreateBillableServiceDto) {
    return this.svc.create(tenantId, dto);
  }

  @Get()
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "List billable services" })
  findAll(@TenantId() tenantId: string) {
    return this.svc.findAll(tenantId);
  }

  @Get(":id")
  @Roles("ADMIN", "RECEPTIONIST", "DOCTOR", "NURSE")
  @ApiOperation({ summary: "Get billable service by ID" })
  findOne(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Patch(":id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Update billable service" })
  update(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateBillableServiceDto,
  ) {
    return this.svc.update(id, tenantId, dto);
  }

  @Delete(":id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Deactivate billable service" })
  remove(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.svc.delete(id, tenantId);
  }
}

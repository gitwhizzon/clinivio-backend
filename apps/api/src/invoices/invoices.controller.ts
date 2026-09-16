import {
  Controller,
  Get,
  Post,
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
  InvoicesService,
  CreateInvoiceDto,
  ConfirmPaymentDto,
} from './invoices.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private svc: InvoicesService) {}

  @Post()
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Create invoice' })
  create(@TenantId() tenantId: string, @Body() dto: CreateInvoiceDto) {
    return this.svc.create(tenantId, dto);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List invoices' })
  findAll(
    @TenantId() tenantId: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('invoiceType') invoiceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.svc.findAll(
      tenantId,
      {
        patientId,
        paymentStatus: status as any,
        invoiceType: invoiceType as any,
        from,
        to,
      },
      page,
      limit,
    );
  }

  @Get('by-patient/:patientId')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get invoices for a patient' })
  getByPatient(
    @Param('patientId') patientId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.getPatientInvoices(patientId, tenantId);
  }

  @Get('by-admission/:admissionId')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get invoices for an IPD admission' })
  getByAdmission(
    @Param('admissionId') admissionId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.getInvoicesByAdmission(admissionId, tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR')
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findById(id, tenantId);
  }

  @Post(':id/confirm-payment')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Confirm payment for invoice' })
  confirmPayment(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.confirmPayment(id, tenantId, dto, user?.sub);
  }

  @Post(':id/refund')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Refund invoice' })
  refund(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.refund(id, tenantId);
  }
}

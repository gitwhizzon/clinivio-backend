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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles, TenantId } from '@mediflow/shared';
import { LabOrderStatus } from '@mediflow/database';
import {
  LabService,
  CreateLabTestDto,
  CreateLabOrderDto,
  UpdateLabOrderItemDto,
  CollectPaymentDto,
  MarkOutsourcedDto,
  CreateReagentDto,
  LogReagentUsageDto,
} from './lab.service';

@ApiTags('Lab')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('lab')
export class LabController {
  constructor(private svc: LabService) {}

  // ─── Lab Test Catalog ─────────────────────────────────────────────────────────

  @Get('tests')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'List lab tests' })
  findTests(
    @TenantId() tenantId: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('all') all?: string,
  ) {
    return this.svc.findTests(tenantId, q, category, all === 'true');
  }

  @Post('tests')
  @Roles('ADMIN', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Create lab test' })
  createTest(@TenantId() tenantId: string, @Body() dto: CreateLabTestDto) {
    return this.svc.createTest(tenantId, dto);
  }

  @Get('tests/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Get lab test by ID' })
  findTest(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findTestById(id, tenantId);
  }

  @Patch('tests/:id')
  @Roles('ADMIN', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Update lab test' })
  updateTest(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: Partial<CreateLabTestDto> & { isActive?: boolean },
  ) {
    return this.svc.updateTest(id, tenantId, dto);
  }

  // ─── Lab Orders ───────────────────────────────────────────────────────────────

  @Post('orders')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR')
  @ApiOperation({ summary: 'Create lab order' })
  createOrder(@TenantId() tenantId: string, @Body() dto: CreateLabOrderDto) {
    return this.svc.createOrder(tenantId, dto);
  }

  @Get('orders')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'List lab orders' })
  findOrders(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.svc.findOrders(
      tenantId,
      { status: status as any, patientId, from, to },
      page,
      limit,
    );
  }

  @Get('orders/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Get lab order by ID' })
  findOrder(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOrderById(id, tenantId);
  }

  /**
   * PATCH /lab/orders/:id/results
   * Bulk-update all items of an order in one call.
   * Body: { results: [{ itemId, result, flag?, notes?, unit?, normalRange? }] }
   */
  @Patch('orders/:id/results')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Bulk-enter results for a lab order' })
  async updateOrderResults(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('results') results: UpdateLabOrderItemDto[],
  ) {
    // Update each item in sequence
    const updated = [];
    for (const item of results ?? []) {
      const { itemId, ...dto } = item as any;
      if (itemId) {
        updated.push(
          await this.svc.updateOrderItemResult(itemId, tenantId, dto),
        );
      }
    }
    // After entering results, mark order as COMPLETED
    await this.svc.updateOrderStatus(id, tenantId, LabOrderStatus.COMPLETED);
    return this.svc.findOrderById(id, tenantId);
  }

  /**
   * PATCH /lab/orders/:id/sample-collected
   * PATCH /lab/orders/:id/processing
   * PATCH /lab/orders/:id/completed
   * Status transition helpers.
   */
  @Patch('orders/:id/sample-collected')
  @Roles('ADMIN', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Mark sample collected' })
  sampleCollected(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('assignedToId') assignedToId?: string,
  ) {
    return this.svc.updateOrderStatus(
      id,
      tenantId,
      LabOrderStatus.SAMPLE_COLLECTED,
      assignedToId,
    );
  }

  @Patch('orders/:id/processing')
  @Roles('ADMIN', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Mark order as processing / in progress' })
  processing(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.updateOrderStatus(id, tenantId, LabOrderStatus.IN_PROGRESS);
  }

  @Patch('orders/:id/completed')
  @Roles('ADMIN', 'NURSE', 'LAB_TECHNICIAN', 'DOCTOR')
  @ApiOperation({ summary: 'Mark order as completed' })
  completed(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.updateOrderStatus(id, tenantId, LabOrderStatus.COMPLETED);
  }

  @Patch('orders/:id/cancel')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Cancel a lab order' })
  cancel(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.updateOrderStatus(id, tenantId, LabOrderStatus.CANCELLED);
  }

  @Patch('orders/:id/status')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Update lab order status (generic)' })
  updateStatus(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('status') status: string,
    @Body('assignedToId') assignedToId?: string,
  ) {
    return this.svc.updateOrderStatus(
      id,
      tenantId,
      status as any,
      assignedToId,
    );
  }

  /** PATCH /lab/order-items/:itemId/result — single item update */
  @Patch('order-items/:itemId/result')
  @Roles('ADMIN', 'NURSE', 'DOCTOR', 'LAB_TECHNICIAN')
  @ApiOperation({ summary: 'Update lab order item result' })
  updateResult(
    @Param('itemId') itemId: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateLabOrderItemDto,
  ) {
    return this.svc.updateOrderItemResult(itemId, tenantId, dto);
  }

  @Get('analytics')
  @Roles('ADMIN', 'LAB_TECHNICIAN', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'Get lab analytics' })
  analytics(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getAnalytics(tenantId, from, to);
  }

  @Post('orders/:id/collect-payment')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  @ApiOperation({
    summary: 'Collect payment for a lab order before sample collection',
  })
  collectPayment(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: CollectPaymentDto,
  ) {
    return this.svc.collectPayment(id, tenantId, dto);
  }

  @Patch('orders/:orderId/items/:itemId/outsource')
  @Roles('ADMIN', 'NURSE')
  @ApiOperation({
    summary: 'Mark a lab order item as outsourced to external lab',
  })
  markOutsourced(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @TenantId() tenantId: string,
    @Body() dto: MarkOutsourcedDto,
  ) {
    return this.svc.markItemOutsourced(orderId, itemId, tenantId, dto);
  }

  @Get('reagents')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  @ApiOperation({ summary: 'List chemical reagents inventory' })
  listReagents(@TenantId() tenantId: string) {
    return this.svc.listReagents(tenantId);
  }

  @Post('reagents')
  @Roles('ADMIN', 'NURSE')
  @ApiOperation({ summary: 'Add a reagent to inventory' })
  createReagent(@TenantId() tenantId: string, @Body() dto: CreateReagentDto) {
    return this.svc.createReagent(tenantId, dto);
  }

  @Patch('reagents/:id')
  @Roles('ADMIN', 'NURSE')
  @ApiOperation({ summary: 'Update reagent details' })
  updateReagent(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: CreateReagentDto,
  ) {
    return this.svc.updateReagent(id, tenantId, dto);
  }

  @Post('reagents/:id/usage')
  @Roles('ADMIN', 'NURSE')
  @ApiOperation({ summary: 'Log reagent usage or restock' })
  logUsage(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: LogReagentUsageDto,
    @Request() req: any,
  ) {
    return this.svc.logReagentUsage(
      id,
      tenantId,
      dto,
      req.user?.sub ?? req.user?.id,
    );
  }

  @Get('dashboard')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  @ApiOperation({
    summary: 'Lab analytics dashboard — daily orders, revenue, reagent alerts',
  })
  dashboard(
    @TenantId() tenantId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.svc.getLabDashboard(tenantId, days);
  }
}

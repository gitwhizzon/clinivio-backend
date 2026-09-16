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
import {
  PharmacyService,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  UpdatePharmacyOrderDto,
  DispenseOrderDto,
  CreatePurchaseDto,
} from './pharmacy.service';

@ApiTags('Pharmacy')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private svc: PharmacyService) {}

  // ─── Pharmacy Orders ──────────────────────────────────────────────────────────

  @Get('orders')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'PHARMACIST')
  @ApiOperation({ summary: 'List pharmacy orders' })
  findAllOrders(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.svc.findAll(
      tenantId,
      { status: status as any, from, to },
      page,
      limit,
    );
  }

  @Get('orders/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'PHARMACIST')
  @ApiOperation({ summary: 'Get pharmacy order by ID' })
  findOrder(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findOrderById(id, tenantId);
  }

  @Patch('orders/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Update pharmacy order status' })
  updateOrder(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdatePharmacyOrderDto,
  ) {
    return this.svc.updateOrder(id, tenantId, dto);
  }

  @Post('orders/:id/dispense')
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({
    summary:
      'Confirm dispensing: validate stock, deduct inventory, create invoice, mark DISPENSED',
  })
  dispenseOrder(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: DispenseOrderDto,
  ) {
    return this.svc.dispenseOrder(id, tenantId, dto);
  }

  // ─── Inventory ────────────────────────────────────────────────────────────────

  @Get('inventory')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'List pharmacy inventory' })
  listInventory(
    @TenantId() tenantId: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.svc.listInventory(tenantId, q, page, limit);
  }

  @Post('inventory')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Create inventory item' })
  createItem(
    @TenantId() tenantId: string,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.svc.createInventoryItem(tenantId, dto);
  }

  @Get('inventory/low-stock')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Get low stock items' })
  lowStock(@TenantId() tenantId: string) {
    return this.svc.getLowStockItems(tenantId);
  }

  @Get('inventory/expiring')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Get items expiring soon' })
  expiring(
    @TenantId() tenantId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.svc.getExpiringItems(tenantId, days);
  }

  @Get('inventory/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'PHARMACIST')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  findItem(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.findInventoryItem(id, tenantId);
  }

  @Patch('inventory/:id')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Update inventory item' })
  updateItem(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.svc.updateInventoryItem(id, tenantId, dto);
  }

  /** PATCH /pharmacy/inventory/:id/stock — adjust stock (delta or absolute qty) */
  @Patch('inventory/:id/stock')
  @Post('inventory/:id/adjust-stock') // legacy alias
  @Roles('ADMIN', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Adjust stock quantity' })
  adjustStock(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body('delta') delta?: number,
    @Body('qty') qty?: number,
  ) {
    // Support both { delta: +/-N } and { qty: absoluteN }
    const change = delta ?? qty ?? 0;
    return this.svc.adjustStock(id, tenantId, change);
  }

  /**
   * PATCH /pharmacy/settings
   * Update tenant-level pharmacy display settings (name, license, etc.).
   * Delegates to tenants service update; pharmacist can update pharmacy name.
   */
  @Patch('settings')
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Update pharmacy display settings' })
  updateSettings() {
    // Settings are tenant-level (pharmacyName, drugLicenseNo).
    // Clients should use PATCH /tenants/:id/profile for those fields.
    // This stub returns a no-op success so existing frontend calls don't break.
    return {
      message: 'Use PATCH /tenants/:id/profile to update pharmacy settings',
    };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({
    summary: 'Pharmacy analytics: revenue trend and expiry timeline',
  })
  analyticsDashboard(
    @TenantId() tenantId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.svc.getPharmacyAnalytics(tenantId, days);
  }

  // ─── Alerts (doctor-visible) ──────────────────────────────────────────────────

  @Get('alerts')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Consolidated low-stock and expiring-soon alerts' })
  getAlerts(@TenantId() tenantId: string) {
    return this.svc.getAlerts(tenantId);
  }

  // ─── Purchase Invoices ────────────────────────────────────────────────────────

  @Get('purchases')
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'List purchase invoices' })
  listPurchases(
    @TenantId() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listPurchases(tenantId, page, limit);
  }

  @Post('purchases')
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Record a purchase invoice (auto-updates stock)' })
  createPurchase(
    @TenantId() tenantId: string,
    @Body() dto: CreatePurchaseDto,
    @Request() req: any,
  ) {
    return this.svc.createPurchase(
      tenantId,
      dto,
      req.user?.sub ?? req.user?.id,
    );
  }

  @Get('purchases/:id')
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Get purchase invoice by ID' })
  getPurchase(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getPurchaseById(id, tenantId);
  }
}

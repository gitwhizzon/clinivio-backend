import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '@mediflow/shared';

class TestWhatsappCredentialsDto {
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

@ApiTags('Tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(
    private tenantsService: TenantsService,
    private whatsappService: WhatsappService,
  ) {}

  /**
   * Lets the onboarding form test a WhatsApp phoneNumberId/accessToken pair
   * before a tenant even exists yet — same read-only provider check
   * verifySetup() runs after onboarding, just callable earlier.
   */
  @Post('verify-whatsapp-credentials')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Test a WhatsApp phoneNumberId/accessToken pair against the provider, without a tenant existing yet',
  })
  verifyWhatsappCredentials(@Body() dto: TestWhatsappCredentialsDto) {
    if (!dto.phoneNumberId || !dto.accessToken) {
      return { ok: false, detail: 'Enter both the Phone Number ID and Access Token first' };
    }
    return this.whatsappService.verifyCredentials(dto);
  }

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'List all tenants with user counts and admin info' })
  findAll() {
    return this.tenantsService.findAllWithStats();
  }

  @Get(':id')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'DOCTOR',
    'NURSE',
    'PHARMACIST',
  )
  @ApiOperation({ summary: 'Get a single tenant by ID' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Onboard a new hospital tenant (creates schema + admin user)',
  })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  /**
   * Full edit — any combination of tenant profile fields and/or admin credentials.
   * SuperAdmin can update everything that was set during onboarding in one call.
   */
  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Edit tenant profile and/or admin user credentials',
    description:
      'All fields are optional. Supply any tenant profile fields (name, address, subscription ' +
      'tier, WhatsApp IDs, …) and/or admin user fields (adminEmail, adminPassword, ' +
      'adminFirstName, adminLastName, adminPhone) in a single PATCH.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  /**
   * Tenant-level profile endpoint — same underlying service method, but accessible
   * to ADMIN and PHARMACIST roles within their own tenant context.
   */
  @Patch(':id/profile')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @ApiOperation({
    summary:
      'Update hospital/pharmacy profile (logo, print header, tagline, …)',
  })
  updateProfile(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  /** Generate a fresh random password for the tenant's ADMIN user and return it */
  @Post(':id/reset-admin-password')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Reset admin password — generates a secure random password',
  })
  resetAdminPassword(@Param('id') id: string) {
    return this.tenantsService.resetAdminPassword(id);
  }

  @Get(':id/verify-setup')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Run read-only checks (active status, admin account, subdomain DNS, WhatsApp credentials) so a problem shows up before the hospital starts using it',
  })
  verifySetup(@Param('id') id: string) {
    return this.tenantsService.verifySetup(id);
  }

  @Patch(':id/deactivate')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Deactivate a tenant (soft disable, keeps data)' })
  deactivate(@Param('id') id: string) {
    return this.tenantsService.deactivate(id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Permanently delete a tenant — drops schema and all data',
  })
  delete(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }
}

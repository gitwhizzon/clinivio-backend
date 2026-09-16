import {
  IsEmail,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { SubscriptionTier } from "@mediflow/database";

/**
 * PATCH /tenants/:id
 *
 * Every field is optional.  SuperAdmin can update any combination of tenant
 * profile fields and/or the tenant's ADMIN user credentials in a single call.
 */
export class UpdateTenantDto {
  // ── Tenant profile ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: "Apollo Hospitals" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stateCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional({
    description: "CGST rate in %, e.g. 9 for 9%",
    example: 9,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  cgstRate?: number;
  @ApiPropertyOptional({
    description: "SGST rate in %, e.g. 9 for 9%",
    example: 9,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  sgstRate?: number;
  @ApiPropertyOptional({
    description: "IGST rate in %, e.g. 18 for 18%",
    example: 18,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  igstRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() drugLicenseNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() abhaHipId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wabaId?: string;

  @ApiPropertyOptional({ enum: SubscriptionTier })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  subscriptionTier?: SubscriptionTier;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "Allow doctors to start consultations before the fee is paid (patient pays at the end). Defaults to false — payment is required before check-in.",
  })
  @IsOptional()
  @IsBoolean()
  allowConsultationBeforePayment?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() printHeader?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pharmacyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() portalUrl?: string;

  // ── Admin user ─────────────────────────────────────────────────────────────
  /** Change the ADMIN user's login email */
  @ApiPropertyOptional({ example: "admin@hospital.com" })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  /** Set a specific new password for the ADMIN user (min 8 chars) */
  @ApiPropertyOptional({ example: "NewPass@123" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  adminPassword?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() adminFirstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminLastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() adminPhone?: string;
}

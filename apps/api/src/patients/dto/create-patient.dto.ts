import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, Language } from '@mediflow/database';

export class CreatePatientDto {
  @ApiProperty() @IsString() @MinLength(1) firstName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiProperty() @IsString() @Matches(/^\+?[1-9]\d{7,14}$/) phone: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  whatsappPhone?: string;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasWhatsapp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() familyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dob?: string;
  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsString() bloodGroup?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() abhaId?: string;
  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  consentGiven?: boolean;
}

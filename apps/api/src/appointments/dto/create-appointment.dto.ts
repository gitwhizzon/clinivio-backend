import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisitType, AppointmentType } from '@mediflow/database';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  patientId: string;

  @ApiProperty()
  @IsString()
  @IsUUID()
  doctorId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUUID()
  slotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @ApiPropertyOptional({ enum: AppointmentType })
  @IsOptional()
  @IsEnum(AppointmentType)
  appointmentType?: AppointmentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referredBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  opinionObtainedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  // Accepted so the booking form's "Collect payment at billing counter"
  // checkbox doesn't trip the global whitelist validator — not yet read
  // anywhere downstream (every appointment starts PENDING regardless).
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payAtCounter?: boolean;
}

import {
  Controller,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsUUID,
  MinLength,
} from 'class-validator';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

class LoginDto {
  @IsString()
  identifier: string;

  @IsString()
  password: string;

  /** Tenant UUID — accepted for backwards compatibility */
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  /** Hospital slug (e.g. "citihospital") — preferred over tenantId for UI login */
  @IsOptional()
  @IsString()
  slug?: string;
}

class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;

  /** Hospital slug — required to scope the lookup to the right tenant */
  @IsString()
  slug: string;
}

class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 900000, limit: 10 } })
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email, password, and optional tenantId',
  })
  async login(@Body() _dto: LoginDto, @Request() req: any) {
    return this.authService.login(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: any) {
    return this.authService.logout(req.user.id);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change the authenticated user's own password" })
  async changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.authService.changePassword(
      req.user.id,
      req.user.tenantId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email, dto.slug);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using a token from the reset email',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }
}

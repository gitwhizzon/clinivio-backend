import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Res,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsUUID,
  ValidateIf,
} from "class-validator";
import {
  IsStrongPassword,
  authCookieOptions,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '@mediflow/shared';
import { AuthService } from "./auth.service";
import { MicrosoftSsoService } from "./microsoft-sso.service";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

class LoginDto {
  @ValidateIf((o) => !o.email)
  @IsString()
  identifier: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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
  // Optional — the browser SPA sends this via the httpOnly refreshToken
  // cookie instead. Kept for non-browser API clients (scripts, tooling).
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @IsStrongPassword()
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
  @IsStrongPassword()
  newPassword: string;
}

class SsoExchangeDto {
  @IsString()
  code: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private microsoftSsoService: MicrosoftSsoService,
    private configService: ConfigService,
  ) {}

  /**
   * Sets both auth tokens as httpOnly cookies. The browser SPA no longer
   * reads/stores accessToken or refreshToken from the response body — the
   * body still includes them for now purely for script/tooling compatibility
   * (e.g. scripts/smoke-test.ts), but they're no longer what closes the loop
   * for a real browser session.
   */
  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, authCookieOptions('/'));
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      authCookieOptions('/auth'),
    );
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, authCookieOptions('/'));
    res.clearCookie(REFRESH_TOKEN_COOKIE, authCookieOptions('/auth'));
  }

  @Post('login')
  @Throttle({ default: { ttl: 900000, limit: 10 } })
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Login with identifier/email, password, and optional tenantId or slug",
  })
  async login(
    @Body() _dto: LoginDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(req.user);
    this.setAuthCookies(res, result);
    return result;
  }

  // ── Microsoft Entra ID SSO — platform SUPER_ADMIN login only ────────────────
  // Hospital staff (tenant subdomains) never hit these routes; the frontend
  // only ever renders the "Sign in with Microsoft" link on app.megnim.com.

  @Get('sso/microsoft')
  @Throttle({ default: { ttl: 900000, limit: 20 } })
  @ApiOperation({ summary: 'Redirect to Microsoft Entra ID for platform admin sign-in' })
  async ssoMicrosoft(@Res() res: Response) {
    const url = await this.microsoftSsoService.getAuthorizationUrl();
    return res.redirect(url);
  }

  @Get('sso/microsoft/callback')
  @Throttle({ default: { ttl: 900000, limit: 20 } })
  @ApiOperation({ summary: 'Entra ID redirects here with the authorization code' })
  async ssoMicrosoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('frontendUrl');
    try {
      const profile = await this.microsoftSsoService.handleCallback(code, state);
      const authResponse = await this.authService.loginWithMicrosoftSso(profile);
      const exchangeCode = await this.microsoftSsoService.storeExchangeCode(authResponse);
      return res.redirect(`${frontendUrl}/sso-callback?code=${exchangeCode}`);
    } catch (err: any) {
      this.logger.warn(`SSO callback failed: ${err.message}`);
      return res.redirect(`${frontendUrl}/login?error=sso_failed`);
    }
  }

  @Post('sso/exchange')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exchange the one-time code from the SSO callback redirect for a JWT — keeps the token out of the URL/browser history',
  })
  async ssoExchange(
    @Body() dto: SsoExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = (await this.microsoftSsoService.consumeExchangeCode(
      dto.code,
    )) as { accessToken: string; refreshToken: string; user: unknown } | null;
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired SSO exchange code');
    }
    this.setAuthCookies(res, payload);
    return payload;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] ?? dto.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const result = await this.authService.refreshToken(refreshToken);
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoke the current refresh token so it cannot be used to mint new access tokens',
  })
  async logout(
    @Body() dto: LogoutDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] ?? dto.refreshToken;
    const result = await this.authService.logout(refreshToken);
    this.clearAuthCookies(res);
    return result;
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

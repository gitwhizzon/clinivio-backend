import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtPayload, ACCESS_TOKEN_COOKIE } from '@mediflow/shared';
import { TenantDataSourceRegistry } from '@mediflow/database';

// Cookie first (the browser SPA — httpOnly, never touched by JS) with the
// Authorization header as a fallback (scripts/smoke tests, Swagger's
// "Authorize" button, any future non-browser API client).
function cookieExtractor(req: Request): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly registry: TenantDataSourceRegistry,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey:
        configService.get<string>('jwt.secret') ??
        process.env.JWT_SECRET ??
        'dev-secret',
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // TenantContextMiddleware has already run by this point and resolved the
    // tenant this request is scoped to (from X-Tenant-Slug / subdomain) into
    // ALS. That resolved tenant MUST match the tenant this token was issued
    // for — otherwise a valid JWT for tenant A plus a spoofed X-Tenant-Slug
    // header for tenant B would silently re-scope every TenantEntityManager
    // query in this request to tenant B's data, even though the guard only
    // checked that the token's signature was valid.
    const requestTenantId = this.registry.currentTenantId;
    if (requestTenantId && payload.tenantId !== requestTenantId) {
      throw new UnauthorizedException(
        'Token does not match the requested tenant.',
      );
    }

    // Return the full JWT payload shape so that @CurrentUser() and user.sub both work.
    // Both `id` (legacy) and `sub` (JWT standard) are included for compatibility.
    return {
      sub: payload.sub,
      id: payload.sub, // alias — some controllers use user.id
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };
  }
}

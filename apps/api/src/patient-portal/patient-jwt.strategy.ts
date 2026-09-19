import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { TenantDataSourceRegistry } from '@mediflow/database';
import { PATIENT_ACCESS_TOKEN_COOKIE } from '@mediflow/shared';

export interface PatientJwtPayload {
  sub: string; // patientAccountId
  patientId: string;
  tenantId: string;
  type: 'PATIENT';
  iat?: number;
  exp?: number;
}

function cookieExtractor(req: Request): string | null {
  return req.cookies?.[PATIENT_ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class PatientJwtStrategy extends PassportStrategy(
  Strategy,
  'patient-jwt',
) {
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

  async validate(req: Request, payload: PatientJwtPayload) {
    if (payload.type !== 'PATIENT') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Same cross-tenant defense as JwtStrategy — the tenant resolved from
    // X-Tenant-Slug/subdomain must match the tenant this patient token was
    // issued for.
    const requestTenantId = this.registry.currentTenantId;
    if (requestTenantId && payload.tenantId !== requestTenantId) {
      throw new UnauthorizedException(
        'Token does not match the requested tenant.',
      );
    }

    return {
      sub: payload.sub,
      patientId: payload.patientId,
      tenantId: payload.tenantId,
      type: 'PATIENT' as const,
    };
  }
}

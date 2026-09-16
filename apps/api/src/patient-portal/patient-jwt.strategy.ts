import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface PatientJwtPayload {
  sub: string; // patientAccountId
  patientId: string;
  tenantId: string;
  type: 'PATIENT';
  iat?: number;
  exp?: number;
}

@Injectable()
export class PatientJwtStrategy extends PassportStrategy(
  Strategy,
  'patient-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ??
        process.env.JWT_SECRET ??
        'dev-secret',
    });
  }

  async validate(payload: PatientJwtPayload) {
    if (payload.type !== 'PATIENT') {
      throw new UnauthorizedException('Invalid token type');
    }
    return {
      sub: payload.sub,
      patientId: payload.patientId,
      tenantId: payload.tenantId,
      type: 'PATIENT' as const,
    };
  }
}

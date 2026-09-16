import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@mediflow/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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

  async validate(payload: JwtPayload) {
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

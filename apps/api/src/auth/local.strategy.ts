import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import type { Request } from "express";
import { AuthService } from "./auth.service";

/**
 * Passport local strategy — validates email + password.
 *
 * Supports two login paths from a single URL:
 *
 * 1. SUPER_ADMIN — no tenant identifier needed:
 *      { email, password }
 *
 * 2. Tenant staff (ADMIN, DOCTOR, etc.) — supply either the tenant UUID or slug:
 *      { email, password, tenantId: "<uuid>" }
 *      { email, password, slug: "citihospital" }
 *
 * When a tenantId / slug is present, AuthService directly bootstraps the
 * matching DataSource instead of relying on ALS context from the middleware.
 * This lets all users share the same login URL regardless of subdomain.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private authService: AuthService) {
    super({ usernameField: 'identifier', passReqToCallback: true });
  }

  async validate(
    req: Request,
    identifier: string | undefined,
    password: string,
  ): Promise<any> {
    const { tenantId, slug, email } = req.body as {
      tenantId?: string;
      slug?: string;
      email?: string;
    };
    const resolvedIdentifier = identifier?.trim() || email?.trim();
    if (!resolvedIdentifier) {
      this.logger.warn(
        `Login request missing identifier/email tenantId=${tenantId ?? "none"} slug=${slug ?? "none"}`,
      );
    }
    const user = await this.authService.validateUser(
      resolvedIdentifier ?? "",
      password,
      tenantId,
      slug,
    );
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}

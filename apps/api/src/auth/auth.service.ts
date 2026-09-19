import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import Redis from 'ioredis';
import {
  User,
  Tenant,
  Role,
  TenantDataSourceRegistry,
} from '@mediflow/database';
import { JwtPayload } from '@mediflow/shared';
import { EmailService } from '../email/email.service';
import { SSO_REDIS_CLIENT } from './microsoft-sso.service';

const REFRESH_TOKEN_KEY_PREFIX = 'refresh:';
const DEFAULT_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    /** Platform (public schema) DataSource - used only for SUPER_ADMIN login */
    @InjectDataSource() private readonly platformDs: DataSource,
    /** Per-tenant ALS context - set by TenantContextMiddleware for subdomain requests */
    private readonly registry: TenantDataSourceRegistry,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly emailService: EmailService,
    /** Same Redis instance MicrosoftSsoService uses — namespaced by key prefix, not a separate connection */
    @Inject(SSO_REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async validateUser(
    identifier: string,
    password: string,
    tenantId?: string,
    slug?: string,
  ): Promise<any> {
    const normalizedIdentifier = identifier.trim();
    const maskedIdentifier = this.maskIdentifier(normalizedIdentifier);
    this.logger.log(
      `Login attempt identifier=${maskedIdentifier} tenantId=${tenantId ?? "none"} slug=${slug ?? "none"} hasAls=${this.registry.currentOrNull ? "yes" : "no"}`,
    );

    let targetDs = this.registry.currentOrNull;
    let resolvedTenantId = this.registry.currentTenantId ?? undefined;

    if (!targetDs && (tenantId || slug)) {
      const where = tenantId
        ? { id: tenantId, isActive: true }
        : { slug, isActive: true };

      const tenant = await this.platformDs
        .getRepository(Tenant)
        .findOne({ where });

      if (tenant?.slug) {
        targetDs = await this.registry.getOrCreate(tenant.id, tenant.slug);
        resolvedTenantId = tenant.id;
        this.logger.log(
          `Resolved tenant for login slug=${tenant.slug} tenantId=${tenant.id}`,
        );
      } else {
        // A tenant/slug was explicitly given (e.g. any subdomain of
        // megnim.com resolves and sends its slug automatically) but doesn't
        // match a real, active tenant — reject outright. Falling through to
        // the platform SUPER_ADMIN lookup below would let a request on any
        // nonexistent hospital subdomain silently attempt a platform-admin
        // login, which has nothing to do with what the user asked for.
        this.logger.warn(
          `Login rejected — unknown tenant identifier=${maskedIdentifier} tenantId=${tenantId ?? "none"} slug=${slug ?? "none"}`,
        );
        return null;
      }
    }

    let user: User | null = null;

    if (targetDs && resolvedTenantId) {
      user = await targetDs
        .getRepository(User)
        .createQueryBuilder("user")
        .addSelect("user.passwordHash")
        .leftJoinAndSelect("user.doctorProfile", "doctorProfile")
        .where("user.tenantId = :tenantId", { tenantId: resolvedTenantId })
        .andWhere("user.isActive = :isActive", { isActive: true })
        .andWhere(
          "(LOWER(COALESCE(user.staffId, '')) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier))",
          { identifier: normalizedIdentifier },
        )
        .getOne();

      if (user) {
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
          this.logger.warn(
            `Login password mismatch identifier=${maskedIdentifier} tenantId=${resolvedTenantId} userId=${user.id}`,
          );
          return null;
        }

        await targetDs
          .getRepository(User)
          .update(user.id, { lastLoginAt: new Date() });
      } else {
        this.logger.warn(
          `Tenant login user not found identifier=${maskedIdentifier} tenantId=${resolvedTenantId}`,
        );
      }
    } else {
      user = await this.platformDs
        .getRepository(User)
        .createQueryBuilder("user")
        .addSelect("user.passwordHash")
        .leftJoinAndSelect("user.doctorProfile", "doctorProfile")
        .where("LOWER(user.email) = LOWER(:identifier)", {
          identifier: normalizedIdentifier,
        })
        .andWhere("user.role = :role", { role: Role.SUPER_ADMIN })
        .andWhere("user.isActive = :isActive", { isActive: true })
        .getOne();

      if (user) {
        // Once an account has linked Microsoft SSO, password login for it is
        // permanently closed — not just hidden in the UI. A direct POST to
        // /auth/login with the right password must not work either, since
        // the whole point of SSO here is to gate platform admin access to
        // the corporate Entra directory, not add a parallel unrestricted door.
        if (user.ssoProvider) {
          this.logger.warn(
            `Super-admin password login rejected — account uses SSO identifier=${maskedIdentifier} userId=${user.id}`,
          );
          return null;
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
          this.logger.warn(
            `Super-admin login password mismatch identifier=${maskedIdentifier} userId=${user.id}`,
          );
          return null;
        }

        await this.platformDs
          .getRepository(User)
          .update(user.id, { lastLoginAt: new Date() });
      } else {
        this.logger.warn(
          `Super-admin login user not found identifier=${maskedIdentifier}`,
        );
      }
    }

    if (!user) return null;

    this.logger.log(
      `Login success identifier=${maskedIdentifier} userId=${user.id} tenantId=${user.tenantId ?? "platform"} role=${user.role}`,
    );

    const { passwordHash, ...result } = user;
    return result;
  }

  /**
   * SSO never auto-provisions: an Entra ID login only proves who the person
   * is at Microsoft, not that they should hold a Megnim SUPER_ADMIN
   * account. A matching row must already exist — created the same way the
   * first platform admin was, directly against the users table. This is
   * true even for the allowed-domain fallback below: it lets a verified
   * corporate email claim an existing, unclaimed seat, it never creates one.
   */
  async loginWithMicrosoftSso(profile: {
    oid: string;
    email: string | null;
  }) {
    const userRepo = this.platformDs.getRepository(User);

    let user = await userRepo.findOne({
      where: { ssoSubject: profile.oid, role: Role.SUPER_ADMIN, isActive: true },
    });

    if (!user && profile.email) {
      let existing = await userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: profile.email })
        .andWhere('user.role = :role', { role: Role.SUPER_ADMIN })
        .andWhere('user.isActive = :isActive', { isActive: true })
        .getOne();

      // No exact email match — if this Microsoft account is on an allowed
      // corporate domain, let it claim an existing SUPER_ADMIN seat that no
      // other Microsoft identity has linked yet (e.g. a placeholder-email
      // admin row created before real emails were known).
      if (!existing) {
        const emailDomain = profile.email.split('@')[1]?.toLowerCase();
        const allowedDomains = this.configService.get<string[]>(
          'azureAd.allowedEmailDomains',
        ) ?? [];

        if (emailDomain && allowedDomains.includes(emailDomain)) {
          existing = await userRepo
            .createQueryBuilder('user')
            .where('user.role = :role', { role: Role.SUPER_ADMIN })
            .andWhere('user.isActive = :isActive', { isActive: true })
            .andWhere('user.ssoSubject IS NULL')
            .orderBy('user.createdAt', 'ASC')
            .getOne();

          if (existing) {
            this.logger.log(
              `SSO claiming unlinked SUPER_ADMIN seat ${existing.id} via allowed domain ${emailDomain}`,
            );
          }
        }
      }

      if (existing) {
        // First Microsoft sign-in for this seat — link it by stamping the
        // stable oid (and the real email, for the domain-fallback case where
        // the row still held a placeholder) so future logins match directly.
        await userRepo.update(existing.id, {
          ssoProvider: 'microsoft',
          ssoSubject: profile.oid,
          email: profile.email,
        });
        user = {
          ...existing,
          ssoProvider: 'microsoft',
          ssoSubject: profile.oid,
          email: profile.email,
        };
      }
    }

    if (!user) {
      this.logger.warn(
        `SSO login rejected — no matching SUPER_ADMIN account for oid=${profile.oid} email=${this.maskIdentifier(profile.email ?? '')}`,
      );
      throw new UnauthorizedException(
        'No matching platform admin account for this Microsoft account',
      );
    }

    await userRepo.update(user.id, { lastLoginAt: new Date() });

    this.logger.log(`SSO login success userId=${user.id} email=${this.maskIdentifier(user.email)}`);

    const { passwordHash, ...result } = user;
    return this.login(result);
  }

  async login(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.issueRefreshToken(payload);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        staffId: user.staffId ?? null,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        doctorProfile: user.doctorProfile || null,
      },
    };
  }

  /**
   * Signs a refresh token AND records its jti in Redis with a TTL matching
   * the token's own expiry. refreshToken()/logout() check/delete that same
   * key — a signature-valid-but-unlisted jti means the token was already
   * used (rotated away) or explicitly revoked at logout.
   */
  private async issueRefreshToken(payload: JwtPayload): Promise<string> {
    const jti = crypto.randomUUID();
    const expiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const ttlSeconds = this.parseDurationToSeconds(expiresIn);

    await this.redis.setex(
      `${REFRESH_TOKEN_KEY_PREFIX}${jti}`,
      ttlSeconds,
      payload.sub,
    );

    return this.jwtService.sign(
      { ...payload, jti },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn,
      },
    );
  }

  private parseDurationToSeconds(input: string): number {
    const match = /^(\d+)\s*([smhd])$/i.exec(input.trim());
    if (!match) return DEFAULT_REFRESH_TTL_SECONDS;
    const value = parseInt(match[1], 10);
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return value * multipliers[match[2].toLowerCase()];
  }

  async refreshToken(token: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Tokens issued before revocation support carry no jti — reject them so
    // every session re-authenticates through the new, revocable scheme.
    const key = payload.jti
      ? `${REFRESH_TOKEN_KEY_PREFIX}${payload.jti}`
      : null;
    const stillValid = key ? await this.redis.get(key) : null;
    if (!stillValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: this refresh token is single-use. Deleting it now means a
    // stolen-and-replayed copy fails on its next use instead of working
    // silently forever.
    await this.redis.del(key!);

    const newPayload: JwtPayload = {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };
    const accessToken = this.jwtService.sign(newPayload);
    const refreshToken = await this.issueRefreshToken(newPayload);
    return { accessToken, refreshToken };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        });
        if (payload.jti) {
          await this.redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${payload.jti}`);
        }
      } catch {
        // Already invalid/expired — nothing left to revoke.
      }
    }
    return { message: 'Logged out successfully' };
  }

  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    let targetDs = this.registry.currentOrNull;

    if (!targetDs) {
      const tenant = await this.platformDs
        .getRepository(Tenant)
        .findOne({ where: { id: tenantId } });

      if (tenant?.slug) {
        targetDs = await this.registry.getOrCreate(tenant.id, tenant.slug);
      }
    }

    const repo = targetDs
      ? targetDs.getRepository(User)
      : this.platformDs.getRepository(User);

    const user = await repo.findOne({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        passwordHash: true,
        tenantId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await repo.update(userId, { passwordHash });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(
    email: string,
    slug: string,
  ): Promise<{ message: string }> {
    const tenant = await this.platformDs
      .getRepository(Tenant)
      .findOne({ where: { slug, isActive: true } });

    if (!tenant) {
      return {
        message: 'If that email is registered, a reset link has been sent.',
      };
    }

    const ds = await this.registry.getOrCreate(tenant.id, tenant.slug);
    const userRepo = ds.getRepository(User);

    const user = await userRepo.findOne({
      where: { email, tenantId: tenant.id, isActive: true },
    });

    if (!user) {
      return {
        message: 'If that email is registered, a reset link has been sent.',
      };
    }

    const token = crypto.randomBytes(48).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await userRepo.update(user.id, {
      passwordResetToken: token,
      passwordResetExpiry: expiry,
    });

    const frontendUrl = this.configService.get<string>('frontendUrl');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const { html, text } = this.emailService.buildPasswordResetEmail(
      user.firstName,
      resetUrl,
    );

    await this.emailService.sendMail({
      to: user.email,
      subject: 'Reset your Megnim password',
      html,
      text,
    });

    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.platformDs.getRepository(User).findOne({
      where: { passwordResetToken: token },
    });

    if (!user || !user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired password reset link.');
    }

    if (new Date() > user.passwordResetExpiry) {
      throw new BadRequestException(
        'Password reset link has expired. Please request a new one.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.platformDs.getRepository(User).update(user.id, {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    return {
      message:
        'Password reset successfully. You can now log in with your new password.',
    };
  }

  private maskIdentifier(identifier: string): string {
    const value = identifier?.trim();
    if (!value) return "<empty>";

    if (value.includes("@")) {
      const [name, domain] = value.split("@");
      const maskedName =
        name.length <= 2 ? `${name[0] ?? "*"}*` : `${name.slice(0, 2)}***`;
      return `${maskedName}@${domain}`;
    }

    if (value.length <= 3) return `${value[0] ?? "*"}**`;
    return `${value.slice(0, 3)}***`;
  }
}

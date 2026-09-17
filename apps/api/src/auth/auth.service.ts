import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  User,
  Tenant,
  Role,
  TenantDataSourceRegistry,
} from '@mediflow/database';
import { JwtPayload } from '@mediflow/shared';
import { EmailService } from '../email/email.service';

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
        this.logger.warn(
          `Login tenant resolution failed identifier=${maskedIdentifier} tenantId=${tenantId ?? "none"} slug=${slug ?? "none"}`,
        );
      }
    }

    let user: User | null = null;

    if (targetDs && resolvedTenantId) {
      user = await targetDs
        .getRepository(User)
        .createQueryBuilder("user")
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
        .leftJoinAndSelect("user.doctorProfile", "doctorProfile")
        .where("LOWER(user.email) = LOWER(:identifier)", {
          identifier: normalizedIdentifier,
        })
        .andWhere("user.role = :role", { role: Role.SUPER_ADMIN })
        .andWhere("user.isActive = :isActive", { isActive: true })
        .getOne();

      if (user) {
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
   * is at Microsoft, not that they should hold a Clinivio SUPER_ADMIN
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
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });
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

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
      const newPayload: JwtPayload = {
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
      };
      return { accessToken: this.jwtService.sign(newPayload) };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(_userId: string) {
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

    const user = await repo.findOne({ where: { id: userId, isActive: true } });
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
      subject: 'Reset your Clinivio password',
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

import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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
  constructor(
    /** Platform (public schema) DataSource — used only for SUPER_ADMIN login */
    @InjectDataSource() private readonly platformDs: DataSource,
    /** Per-tenant ALS context — set by TenantContextMiddleware for subdomain requests */
    private readonly registry: TenantDataSourceRegistry,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Validates credentials for both tenant users and super admins.
   *
   * Resolution order for the DataSource to query:
   *  1. Explicit tenantId / slug from the login body  ← new: single-URL login
   *  2. ALS context set by TenantContextMiddleware (subdomain / X-Tenant-Slug header)
   *  3. Platform (public) schema — SUPER_ADMIN only
   *
   * This lets all user types share one login URL regardless of subdomain.
   */
  async validateUser(
    identifier: string,
    password: string,
    tenantId?: string,
    slug?: string,
  ): Promise<any> {
    // ── Resolve DataSource ─────────────────────────────────────────────────
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
      }
    }

    // ── Query the right schema ─────────────────────────────────────────────
    let user: User | null = null;

    if (targetDs && resolvedTenantId) {
      // ── Tenant user path — match staffId OR email ─────────────────────
      user = await targetDs.getRepository(User).findOne({
        where: [
          { tenantId: resolvedTenantId, staffId: identifier, isActive: true },
          { tenantId: resolvedTenantId, email: identifier, isActive: true },
        ],
        relations: ['doctorProfile'],
      });
      if (user) {
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return null;
        await targetDs
          .getRepository(User)
          .update(user.id, { lastLoginAt: new Date() });
      }
    } else {
      // ── SUPER_ADMIN path (no tenant context) — email only ─────────────
      user = await this.platformDs.getRepository(User).findOne({
        where: { email: identifier, role: Role.SUPER_ADMIN, isActive: true },
        relations: ['doctorProfile'],
      });
      if (user) {
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return null;
        await this.platformDs
          .getRepository(User)
          .update(user.id, { lastLoginAt: new Date() });
      }
    }

    if (!user) return null;

    const { passwordHash: _passwordHash, ...result } = user;
    return result;
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

  /**
   * Change the calling user's own password.
   *
   * Works for every role — SUPER_ADMIN (public schema) and all tenant users.
   * Verifies the current password before applying the change.
   */
  async changePassword(
    userId: string,
    tenantId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // ── Resolve the right DataSource ──────────────────────────────────────
    // Prefer ALS context (subdomain requests). If absent, use tenantId from
    // the JWT to bootstrap the correct DataSource — handles Render/Vercel
    // direct-URL logins where no subdomain sets the ALS context.
    let targetDs = this.registry.currentOrNull;

    if (!targetDs) {
      const tenant = await this.platformDs
        .getRepository(Tenant)
        .findOne({ where: { id: tenantId } });

      if (tenant?.slug) {
        // Tenant user — bootstrap their schema DataSource
        targetDs = await this.registry.getOrCreate(tenant.id, tenant.slug);
      }
      // If no slug → platform tenant → targetDs stays null → use platformDs below
    }

    const repo = targetDs
      ? targetDs.getRepository(User)
      : this.platformDs.getRepository(User);

    // ── Verify current password ──────────────────────────────────────────
    const user = await repo.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch)
      throw new UnauthorizedException('Current password is incorrect');

    // ── Apply new password ────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await repo.update(userId, { passwordHash });

    return { message: 'Password changed successfully' };
  }

  /**
   * Generates a password reset token and emails it to the user.
   * Always returns the same success message to prevent email enumeration.
   */
  async forgotPassword(
    email: string,
    slug: string,
  ): Promise<{ message: string }> {
    const tenant = await this.platformDs
      .getRepository(Tenant)
      .findOne({ where: { slug, isActive: true } });

    if (!tenant) {
      // Return generic message even when tenant not found — no enumeration
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

    const token = crypto.randomBytes(48).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

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

  /**
   * Validates the reset token and updates the password.
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Search across all users (shared schema) — token is globally unique
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
}

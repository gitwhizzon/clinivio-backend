import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Request, Response, NextFunction } from 'express';
import { TenantDataSourceRegistry, Tenant } from '@mediflow/database';

/**
 * TenantContextMiddleware
 *
 * Runs on every request. Extracts the tenant slug from:
 *  1. The subdomain: `hansvl.clinivio.ai` → slug = "hansvl"
 *  2. The `X-Tenant-Slug` header (useful for local development on localhost)
 *
 * If a matching active tenant is found, wraps the rest of the request
 * chain inside the tenant's DataSource AsyncLocalStorage context, so
 * TenantEntityManager automatically routes to tenant_<slug> schema.
 *
 * Super-admin routes (no subdomain / slug) skip tenant context entirely.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly registry: TenantDataSourceRegistry,
    @InjectDataSource() private readonly platformDs: DataSource,
  ) {}

  async use(
    req: Request & { tenantSlug?: string },
    res: Response,
    next: NextFunction,
  ) {
    const slug = this.extractSlug(req);

    if (!slug) {
      // No tenant context (platform / super-admin request)
      return next();
    }

    try {
      const tenant = await this.platformDs
        .getRepository(Tenant)
        .findOne({ where: { slug, isActive: true } });

      if (!tenant) {
        this.logger.warn(`Unknown or inactive tenant slug: "${slug}"`);
        return next();
      }

      // Attach slug to request for logging / debugging
      req.tenantSlug = slug;

      await this.registry.runWithTenant(tenant.id, tenant.slug, () => next());
    } catch (err) {
      this.logger.error(
        `TenantContextMiddleware error for slug "${slug}": ${(err as Error).message}`,
      );
      next();
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private extractSlug(req: Request): string | null {
    // 1. X-Tenant-Slug header (dev / API clients that can't use subdomains)
    const header = req.headers['x-tenant-slug'];
    if (typeof header === 'string' && header.trim()) {
      return header.trim().toLowerCase();
    }

    // 2. Subdomain: only extract a tenant slug when the request comes in on a
    //    known Clinivio platform domain.
    //
    //    ✓  hansvl.clinivio.ai          →  slug = "hansvl"
    //    ✓  apollo.whizzon.ai           →  slug = "apollo"
    //    ✗  clinivio-backend.onrender.com  →  ignored (Render direct URL)
    //    ✗  clinivio-frontend.vercel.app   →  ignored (Vercel preview URL)
    //    ✗  localhost                       →  ignored
    const host = req.hostname ?? '';
    const parts = host.split('.');

    const PLATFORM_BASE_DOMAINS = new Set(
      (process.env.PLATFORM_DOMAINS ?? 'clinivio.ai,whizzon.ai')
        .split(',')
        .map((d) => d.trim().toLowerCase()),
    );
    const PLATFORM_SUBDOMAINS = new Set(['www', 'admin', 'api', 'app']);

    if (parts.length >= 3) {
      const baseDomain = parts.slice(-2).join('.');
      const subdomain = parts[0].toLowerCase();
      if (
        PLATFORM_BASE_DOMAINS.has(baseDomain) &&
        !PLATFORM_SUBDOMAINS.has(subdomain)
      ) {
        return subdomain;
      }
    }

    return null;
  }
}

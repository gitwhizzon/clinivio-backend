import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const PATIENT_ACCESS_TOKEN_COOKIE = 'patientAccessToken';

/**
 * httpOnly cookie options for auth tokens. Tokens used to live in the
 * frontend's localStorage — readable (and stealable) by any XSS. Cookies
 * set here are invisible to JS entirely.
 *
 * `domain: '.megnim.com'` in production lets one cookie set by api.megnim.com
 * be sent back to it from app.megnim.com / any-tenant.megnim.com — those are
 * different origins but the same registrable domain, so `sameSite: 'lax'`
 * still allows the cross-subdomain requests our SPA makes (Lax only blocks
 * genuinely cross-SITE requests, not cross-origin-same-site ones).
 *
 * This does NOT cover preview/staging environments where the frontend and
 * API sit on different unrelated domains (e.g. a Vercel preview URL calling
 * an onrender.com URL) — that's a genuinely cross-site setup and cookie-based
 * auth won't work there without SameSite=None, which isn't set up here.
 * Production (megnim.com throughout) and local dev (both on localhost) are
 * both same-site and work correctly.
 */
export function authCookieOptions(pathScope: string): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? '.megnim.com' : undefined,
    path: pathScope,
  };
}

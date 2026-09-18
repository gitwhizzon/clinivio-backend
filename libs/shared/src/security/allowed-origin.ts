/**
 * Validates a CORS Origin header against the platform's base domains
 * (e.g. "megnim.com") using proper hostname parsing via the WHATWG URL API —
 * never raw substring/suffix checks against the full origin string, which
 * are spoofable:
 *
 *   "https://megnim.com.evil.com"   contains "megnim.com" as a substring,
 *                                    but its real hostname is evil.com's
 *                                    subdomain — must be rejected.
 *   "https://evilmegnim.com"        a naive `.endsWith('megnim.com')` (no
 *                                    leading dot) would wrongly accept this.
 *   "http://sub.megnim.com"         plaintext HTTP must never be trusted as
 *                                    a legitimate platform origin.
 *
 * new URL(origin).hostname strips protocol, userinfo, port, path and query,
 * and normalizes IDN/punycode — so a look-alike Unicode domain can't slip
 * through an ASCII string comparison either.
 */
export function isAllowedPlatformOrigin(
  origin: string,
  platformDomains: string[],
): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false; // malformed origin — deny by default
  }

  // Only HTTPS is ever trusted for the platform wildcard match.
  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();

  return platformDomains.some((raw) => {
    const base = raw.trim().toLowerCase();
    if (!base) return false;
    return hostname === base || hostname.endsWith(`.${base}`);
  });
}

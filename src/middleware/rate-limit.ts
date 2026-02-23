import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../server.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lockedUntil?: number;
}

/**
 * Parse TRUSTED_PROXIES env var into a Set of IPs/CIDRs.
 * Accepts comma-separated values: "10.0.0.1,172.16.0.0/12"
 */
function parseTrustedProxies(raw?: string): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Extract client IP from X-Forwarded-For, respecting trusted proxies.
 * When trusted proxies are configured, walks the XFF chain right-to-left
 * and returns the first IP not in the trusted set.
 * Falls back to the rightmost XFF entry or "unknown".
 */
export function getClientIp(
  xff: string | undefined,
  trustedProxies?: Set<string>,
): string {
  if (!xff) return "unknown";
  const ips = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (ips.length === 0) return "unknown";

  if (!trustedProxies || trustedProxies.size === 0) {
    // No trusted proxies configured — use leftmost (traditional)
    return ips[0];
  }

  // Walk right-to-left: skip trusted proxies, return first untrusted IP
  for (let i = ips.length - 1; i >= 0; i--) {
    if (!trustedProxies.has(ips[i])) {
      return ips[i];
    }
  }
  // All IPs are trusted (shouldn't happen) — return leftmost
  return ips[0];
}

/** Shared trusted proxy set — initialized once per process. */
let _trustedProxies: Set<string> | undefined;

export function initTrustedProxies(raw?: string): void {
  _trustedProxies = parseTrustedProxies(raw);
}

/**
 * In-memory sliding-window rate limiter.
 *
 * - `windowMs`: Time window in milliseconds.
 * - `max`: Maximum requests per window.
 * - `lockoutMs`: Optional lockout duration after exceeding limit.
 * - `keyFn`: Key extraction function (defaults to client IP via trusted proxy logic).
 */
export function rateLimitMiddleware(opts: {
  windowMs: number;
  max: number;
  lockoutMs?: number;
  keyFn?: (c: { req: { header: (name: string) => string | undefined } }) => string;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of stale entries
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (
        now > entry.resetAt &&
        (!entry.lockedUntil || now > entry.lockedUntil)
      ) {
        store.delete(key);
      }
    }
  }, 60_000);
  cleanup.unref();

  return createMiddleware<AppBindings>(async (c, next) => {
    const key = opts.keyFn
      ? opts.keyFn(c)
      : getClientIp(c.req.header("x-forwarded-for"), _trustedProxies);
    const now = Date.now();

    let entry = store.get(key);

    // Check lockout
    if (entry?.lockedUntil && now < entry.lockedUntil) {
      const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.text("Too many requests", 429);
    }

    // Reset window if expired
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > opts.max) {
      if (opts.lockoutMs) {
        entry.lockedUntil = now + opts.lockoutMs;
      }
      const retryAfter = Math.ceil(
        (opts.lockoutMs || entry.resetAt - now) / 1000,
      );
      c.header("Retry-After", String(retryAfter));
      return c.text("Too many requests", 429);
    }

    await next();
  });
}

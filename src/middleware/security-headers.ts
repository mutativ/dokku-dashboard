import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../server.js";

/**
 * Add security headers to all responses.
 */
export function securityHeadersMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    await next();

    const h = c.res.headers;
    h.set("X-Content-Type-Options", "nosniff");
    h.set("X-Frame-Options", "DENY");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    // CSP: allow self + inline scripts (HTMX, Tailwind) + CDN for styles/fonts
    h.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "connect-src 'self'",
        "img-src 'self' data:",
        "font-src 'self' https://cdn.jsdelivr.net",
      ].join("; "),
    );

    // HSTS in production
    const env = c.get("env");
    if (env.NODE_ENV === "production") {
      h.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
  });
}

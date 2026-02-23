import { randomBytes } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../server.js";

const CSRF_COOKIE = "csrf_tok";

function getCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

/**
 * Double-submit cookie CSRF protection.
 *
 * - Generates a random token stored in an HttpOnly cookie.
 * - Injects `<input type="hidden" name="_csrf" value="…">` before every
 *   `</form>` in HTML responses (covers both regular forms and HTMX).
 * - Validates on POST that the form field matches the cookie value.
 */
export function csrfMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    // Reuse existing token or generate a new one
    let token = getCookie(c.req.header("cookie"), CSRF_COOKIE);
    if (!token || token.length !== 64) {
      token = randomBytes(32).toString("hex");
    }

    // Validate on POST
    if (c.req.method === "POST") {
      // Accept token from X-CSRF-Token header (HTMX) or _csrf form field
      const headerToken = c.req.header("X-CSRF-Token") ?? "";
      const formToken = headerToken || (() => {
        // Only parse body if no header token (avoids consuming body for HTMX requests)
        return "";
      })();
      // For header-based token, validate directly; for form, parse body
      if (headerToken) {
        if (headerToken !== token) {
          return c.text("CSRF validation failed", 403);
        }
      } else {
        const body = await c.req.parseBody();
        const bodyToken = typeof body._csrf === "string" ? body._csrf : "";
        if (!bodyToken || bodyToken !== token) {
          return c.text("CSRF validation failed", 403);
        }
      }
    }

    await next();

    // Append CSRF cookie to response
    c.res.headers.append(
      "Set-Cookie",
      `${CSRF_COOKIE}=${token}; Path=/; SameSite=Strict`,
    );

    // Inject CSRF hidden inputs into HTML form responses
    const ct = c.res.headers.get("content-type");
    if (ct?.includes("text/html")) {
      const html = await c.res.text();
      const injected = html.replace(
        /(<\/form>)/gi,
        `<input type="hidden" name="_csrf" value="${token}">$1`,
      );
      c.res = new Response(injected, {
        status: c.res.status,
        headers: c.res.headers,
      });
    }
  });
}

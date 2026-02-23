import { createHmac, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../server.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const SESSION_TTL_S = 24 * 60 * 60;
export const COOKIE_NAME = "dokku_dash_session";

export interface SessionInfo {
  valid: boolean;
  email?: string;
}

/**
 * Create a signed session token.
 *
 * Format: `<payload>.<hmac>`
 * - Password auth payload: `<timestamp>`
 * - Google auth payload:   `<email>:<timestamp>`
 */
export function createSession(secret: string, email?: string): string {
  const ts = Date.now().toString(36);
  const payload = email ? `${email}:${ts}` : ts;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Parse and validate a session token.
 * Backward-compatible: tokens without email (password auth) are still valid.
 */
export function parseSession(
  token: string | undefined,
  secret: string,
): SessionInfo {
  if (!token) return { valid: false };
  const dot = token.lastIndexOf(".");
  if (dot < 1) return { valid: false };

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Verify signature
  const expected = sign(payload, secret);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return { valid: false };
  }

  // Extract timestamp (last colon-separated segment, or entire payload)
  const colonIdx = payload.lastIndexOf(":");
  const tsStr = colonIdx >= 0 ? payload.slice(colonIdx + 1) : payload;
  const email = colonIdx >= 0 ? payload.slice(0, colonIdx) : undefined;

  // Check TTL
  const created = parseInt(tsStr, 36);
  if (isNaN(created) || Date.now() - created > SESSION_TTL_MS) {
    return { valid: false };
  }

  return { valid: true, email };
}

export function getTokenFromCookie(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Cookie SameSite policy — Lax for OAuth redirects, Strict otherwise. */
export function sessionCookieSameSite(authMode: string): string {
  return authMode === "google" || authMode === "both" ? "Lax" : "Strict";
}

export function authMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    const env = c.get("env");

    // No-auth mode for local development
    if (env.AUTH_MODE === "none") {
      return next();
    }

    const path = c.req.path;
    if (
      path === "/login" ||
      path === "/logout" ||
      path === "/health" ||
      path === "/auth/google" ||
      path === "/auth/callback"
    ) {
      return next();
    }

    const token = getTokenFromCookie(c.req.header("cookie"));
    const session = parseSession(token, env.SESSION_SECRET!);
    if (!session.valid) {
      return c.redirect("/login");
    }
    if (session.email) {
      c.set("userEmail", session.email);
    }
    await next();
  });
}

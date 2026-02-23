import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { AppBindings } from "../server.js";
import {
  createSession,
  parseSession,
  getTokenFromCookie,
  sessionCookieSameSite,
  COOKIE_NAME,
  SESSION_TTL_S,
} from "../middleware/auth.js";
import { verifyPassword } from "../lib/password.js";
import { getGoogleAuthUrl, verifyGoogleCallback } from "../lib/google-auth.js";
import { loginPage } from "../views/pages/login.js";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_TTL_S = 300; // 5 minutes

export function authRoutes() {
  const app = new Hono<AppBindings>();

  // ── Login page ────────────────────────────────────────────────────────

  app.get("/login", (c) => {
    const env = c.get("env");
    if (env.AUTH_MODE === "none") return c.redirect("/apps");
    const token = getTokenFromCookie(c.req.header("cookie"));
    if (parseSession(token, env.SESSION_SECRET!).valid) {
      return c.redirect("/apps");
    }
    const showGoogle = env.AUTH_MODE === "google" || env.AUTH_MODE === "both";
    const showPassword = env.AUTH_MODE === "password" || env.AUTH_MODE === "both";
    return c.html(loginPage({ showGoogle, showPassword }));
  });

  // ── Password login ────────────────────────────────────────────────────

  app.post("/login", async (c) => {
    const env = c.get("env");
    const showGoogle = env.AUTH_MODE === "google" || env.AUTH_MODE === "both";
    const showPassword = env.AUTH_MODE === "password" || env.AUTH_MODE === "both";

    if (!showPassword) {
      return c.html(loginPage({ showGoogle, showPassword, error: "Password login is disabled" }));
    }

    const body = await c.req.parseBody();
    const pw = typeof body.password === "string" ? body.password : "";

    if (!env.DASHBOARD_PASSWORD_HASH || !verifyPassword(pw, env.DASHBOARD_PASSWORD_HASH)) {
      return c.html(loginPage({ showGoogle, showPassword, error: "Invalid password" }));
    }

    const sameSite = sessionCookieSameSite(env.AUTH_MODE);
    const token = createSession(env.SESSION_SECRET!);
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_TTL_S}`,
    );
    return c.redirect("/apps");
  });

  // ── Google OAuth: initiate ────────────────────────────────────────────

  app.get("/auth/google", (c) => {
    const env = c.get("env");
    if (env.AUTH_MODE !== "google" && env.AUTH_MODE !== "both") {
      return c.redirect("/login");
    }

    const state = randomBytes(32).toString("hex");

    // Store state in a short-lived signed cookie for CSRF verification
    c.header(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_S}`,
    );

    const url = getGoogleAuthUrl(
      env.GOOGLE_CLIENT_ID!,
      env.PUBLIC_URL!,
      state,
      env.GOOGLE_ALLOWED_DOMAIN!,
    );
    return c.redirect(url);
  });

  // ── Google OAuth: callback ────────────────────────────────────────────

  app.get("/auth/callback", async (c) => {
    const env = c.get("env");
    const showGoogle = env.AUTH_MODE === "google" || env.AUTH_MODE === "both";
    const showPassword = env.AUTH_MODE === "password" || env.AUTH_MODE === "both";

    if (!showGoogle) {
      return c.redirect("/login");
    }

    // Verify state
    const queryState = c.req.query("state") ?? "";
    const cookieHeader = c.req.header("cookie");
    const cookieState = getCookieValue(cookieHeader, OAUTH_STATE_COOKIE);

    if (!queryState || !cookieState || queryState !== cookieState) {
      return c.html(loginPage({ showGoogle, showPassword, error: "Invalid OAuth state — try again" }));
    }

    // Clear state cookie
    c.header(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );

    const code = c.req.query("code");
    const oauthError = c.req.query("error");

    if (oauthError || !code) {
      const msg = oauthError === "access_denied"
        ? "Access denied by Google"
        : `OAuth error: ${oauthError || "no authorization code"}`;
      return c.html(loginPage({ showGoogle, showPassword, error: msg }));
    }

    try {
      const user = await verifyGoogleCallback(
        code,
        env.GOOGLE_CLIENT_ID!,
        env.GOOGLE_CLIENT_SECRET!,
        env.PUBLIC_URL!,
        env.GOOGLE_ALLOWED_DOMAIN!,
      );

      const sameSite = sessionCookieSameSite(env.AUTH_MODE);
      const token = createSession(env.SESSION_SECRET!, user.email);
      c.header(
        "Set-Cookie",
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_TTL_S}`,
      );
      return c.redirect("/apps");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google authentication failed";
      return c.html(loginPage({ showGoogle, showPassword, error: msg }));
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────

  app.get("/logout", (c) => {
    const env = c.get("env");
    const sameSite = sessionCookieSameSite(env.AUTH_MODE);
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0`,
    );
    return c.redirect("/login");
  });

  return app;
}

function getCookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

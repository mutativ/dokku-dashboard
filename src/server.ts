import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import type { DashboardEnv } from "./config.js";
import { sshConfigFromEnv } from "./lib/ssh.js";
import { DokkuClient } from "./lib/dokku.js";
import { MockDokkuClient } from "./lib/mock-dokku.js";
import { authMiddleware } from "./middleware/auth.js";
import { csrfMiddleware } from "./middleware/csrf.js";
import { rateLimitMiddleware, initTrustedProxies } from "./middleware/rate-limit.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.js";
import { authRoutes } from "./routes/auth.js";
import { appsRoutes } from "./routes/apps.js";
import { databasesRoutes } from "./routes/databases.js";
import { envRoutes } from "./routes/env.js";
import { domainsRoutes } from "./routes/domains.js";
import { scalingRoutes } from "./routes/scaling.js";
import { dbExplorerRoutes } from "./routes/db-explorer.js";

export type AppBindings = {
  Variables: {
    env: DashboardEnv;
    dokku: DokkuClient;
    userEmail?: string;
  };
};

export function createApp(env: DashboardEnv) {
  const app = new Hono<AppBindings>();
  let dokku: DokkuClient;
  try {
    dokku = new DokkuClient(sshConfigFromEnv(env));
  } catch {
    dokku = new MockDokkuClient();
  }

  // Initialize trusted proxies for rate limiter IP extraction
  initTrustedProxies(env.TRUSTED_PROXIES);

  // Pre-warm SSH connection and cache in background
  dokku.warmup();

  app.use("*", logger());

  // Security headers on all responses
  app.use("*", securityHeadersMiddleware());

  // Inject env + dokku client into context
  app.use("*", async (c, next) => {
    c.set("env", env);
    c.set("dokku", dokku);
    await next();
  });

  // Static assets (before auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use("/public/*", serveStatic({ root: "./dist" }) as any);

  // Favicon redirect (before auth)
  app.get("/favicon.ico", (c) => c.redirect("/public/favicon-32.png", 301));

  // Health check (before auth)
  app.get("/health", (c) =>
    c.json({ ok: true, version: process.env.APP_VERSION ?? "dev", timestamp: new Date().toISOString() }),
  );

  // Rate limit login attempts: 5 per minute per IP, 15-minute lockout
  app.post(
    "/login",
    rateLimitMiddleware({
      windowMs: 60_000,
      max: 5,
      lockoutMs: 15 * 60_000,
    }),
  );

  // CSRF protection on all routes (injects tokens into forms, validates on POST)
  app.use("*", csrfMiddleware());

  // Auth routes (login/logout -- no auth guard)
  app.route("/", authRoutes());

  // Auth guard for everything else
  app.use("*", authMiddleware());

  // General rate limit for authenticated routes: 60 requests/minute per IP
  app.use(
    "*",
    rateLimitMiddleware({
      windowMs: 60_000,
      max: 60,
    }),
  );

  // Sidebar counts API
  app.get("/api/counts", async (c) => {
    const dk = c.get("dokku");
    try {
      const [apps, dbs] = await Promise.all([dk.appsList(), dk.postgresList()]);
      return c.json({ apps: apps.length, databases: dbs.length });
    } catch {
      return c.json({ apps: 0, databases: 0 });
    }
  });

  // Protected routes
  app.route("/apps", appsRoutes());
  app.route("/databases", databasesRoutes());
  app.route("/apps/:name/env", envRoutes());
  app.route("/apps/:name/domains", domainsRoutes());
  app.route("/apps/:name/scaling", scalingRoutes());
  // SQL explorer — only enabled when ENABLE_SQL_EXPLORER=true
  if (env.ENABLE_SQL_EXPLORER) {
    app.route("/databases/:name/explore", dbExplorerRoutes());
  }

  // Root redirect
  app.get("/", (c) => c.redirect("/apps"));

  return app;
}

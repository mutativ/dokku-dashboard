import { z } from "zod";

// Treat empty strings as undefined for optional env vars
const optStr = z.string().transform((v) => v || undefined).pipe(z.string().min(1).optional());

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4200),

    // Auth — password hash is required when AUTH_MODE includes "password"
    DASHBOARD_PASSWORD_HASH: optStr,
    SESSION_SECRET: z.string().min(32).optional(),

    // Auth mode
    AUTH_MODE: z
      .enum(["password", "google", "both", "none"])
      .default("password"),

    // Google OAuth (required when AUTH_MODE includes "google")
    GOOGLE_CLIENT_ID: optStr,
    GOOGLE_CLIENT_SECRET: optStr,
    GOOGLE_ALLOWED_DOMAIN: optStr,
    PUBLIC_URL: z.string().url().optional(),

    // Dokku app name (for self-restart detection)
    DOKKU_APP_NAME: z.string().default("dokku-dashboard"),

    // Dokku SSH
    DOKKU_SSH_HOST: z.string().default("localhost"),
    DOKKU_SSH_PORT: z.coerce.number().int().positive().default(22),
    DOKKU_SSH_USER: z.string().default("dokku"),
    DOKKU_SSH_KEY: optStr, // base64-encoded ed25519 private key (optional for local dev)
    SSH_COMMAND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),

    // Trusted reverse proxies (comma-separated IPs/CIDRs) for X-Forwarded-For
    TRUSTED_PROXIES: z.string().optional(),

    // SQL explorer — opt-in, disabled by default
    ENABLE_SQL_EXPLORER: z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),

    // Mutations — when disabled, dashboard is read-only
    ENABLE_DESTRUCTIVE_ACTIONS: z
      .enum(["true", "false", "1", "0"])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
  })
  .refine(
    (env) => {
      if (env.AUTH_MODE !== "none" && !env.SESSION_SECRET) {
        return false;
      }
      return true;
    },
    { message: "SESSION_SECRET (min 32 chars) is required when AUTH_MODE is not none" },
  )
  .refine(
    (env) => {
      if (env.AUTH_MODE === "password" || env.AUTH_MODE === "both") {
        return !!env.DASHBOARD_PASSWORD_HASH;
      }
      return true;
    },
    { message: "DASHBOARD_PASSWORD_HASH required when AUTH_MODE includes password" },
  )
  .refine(
    (env) => {
      if (env.AUTH_MODE === "none" && env.NODE_ENV === "production") {
        return false;
      }
      return true;
    },
    { message: "AUTH_MODE=none is not allowed in production" },
  )
  .refine(
    (env) => {
      if (env.AUTH_MODE === "google" || env.AUTH_MODE === "both") {
        return (
          !!env.GOOGLE_CLIENT_ID &&
          !!env.GOOGLE_CLIENT_SECRET &&
          !!env.GOOGLE_ALLOWED_DOMAIN &&
          !!env.PUBLIC_URL
        );
      }
      return true;
    },
    {
      message:
        "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ALLOWED_DOMAIN, and PUBLIC_URL required when AUTH_MODE includes google",
    },
  );

export type DashboardEnv = z.infer<typeof envSchema>;

export function getEnv(): DashboardEnv {
  return envSchema.parse(process.env);
}

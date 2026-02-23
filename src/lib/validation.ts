import { z } from "zod";

/** Dokku app/database name: lowercase letters, numbers, hyphens. Starts with a letter. */
export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, "Must start with a letter; only lowercase, numbers, hyphens");

/** Environment variable key: uppercase letters, numbers, underscores. */
export const envKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Z_][A-Z0-9_]*$/, "Must be UPPER_SNAKE_CASE");

/** Environment variable value. */
export const envValueSchema = z.string().max(65_536);

/** Domain name. */
export const domainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/,
    "Invalid domain name",
  );

/**
 * DML/DDL keywords that are forbidden anywhere in a query — catches subquery injection
 * like `SELECT * FROM (DELETE FROM users RETURNING *)`.
 */
const FORBIDDEN_SQL_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|DO|CALL)\b/i;

/** SQL query — SELECT/WITH/EXPLAIN only, max 10KB, no semicolons (prevents multi-statement). */
export const sqlQuerySchema = z
  .string()
  .trim()
  .min(1, "No SQL query provided")
  .max(10_000, "Query too large (max 10KB)")
  .refine(
    (sql) => !sql.includes(";"),
    "Multi-statement queries not allowed (no semicolons)",
  )
  .refine(
    (sql) => {
      const upper = sql.toUpperCase().replace(/\s+/g, " ").trim();
      return /^(SELECT|WITH|EXPLAIN)\b/.test(upper);
    },
    "Only SELECT, WITH, and EXPLAIN queries are allowed",
  )
  .refine(
    (sql) => {
      // Strip string literals to avoid false positives on words inside quotes
      const stripped = sql.replace(/'[^']*'/g, "''");
      return !FORBIDDEN_SQL_KEYWORDS.test(stripped);
    },
    "Query contains forbidden DML/DDL keywords (INSERT, UPDATE, DELETE, DROP, etc.)",
  );

/** Process type for scaling (e.g. "web", "worker"). */
export const processTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9_-]*$/, "Invalid process type");

/** Resource value (e.g. "512m", "1", "2G"). */
export const resourceValueSchema = z
  .string()
  .trim()
  .max(16)
  .regex(/^[0-9]+[a-zA-Z]?$/, "Invalid resource value (e.g. 512m, 1, 2G)");

/** Scale count. */
export const scaleCountSchema = z.coerce.number().int().min(0).max(32);

/**
 * Extract a validation error message from a ZodError.
 */
export function validationError(err: z.core.$ZodError): string {
  const issue = err.issues[0];
  return issue ? issue.message : "Validation failed";
}

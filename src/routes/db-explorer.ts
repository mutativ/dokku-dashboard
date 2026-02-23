import { Hono } from "hono";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { dbExplorerPage, dbTableDetailPage, dbQueryResultPartial } from "../views/pages/db-explorer.js";
import { alert } from "../views/components/alert.js";
import { sqlQuerySchema, validationError } from "../lib/validation.js";

export function dbExplorerRoutes() {
  const app = new Hono<AppBindings>();

  // ── Tables list ────────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;

    try {
      const tables = await dokku.postgresTables(name);
      return c.html(layout(`${name} - Explorer`, dbExplorerPage(name, tables), "/databases", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list tables";
      return c.html(layout(`${name} - Explorer`, alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Table detail (schema + preview) ────────────────────────────────────

  app.get("/table/:table", async (c) => {
    const dokku = c.get("dokku");
    const dbName = c.req.param("name")!;
    const tableName = c.req.param("table")!;

    try {
      const [schema, preview] = await Promise.all([
        dokku.postgresTableSchema(dbName, tableName),
        dokku.postgresTablePreview(dbName, tableName),
      ]);
      return c.html(layout(
        `${tableName} - ${dbName}`,
        dbTableDetailPage(dbName, tableName, schema, preview),
        "/databases",
        c.get("userEmail"),
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get table info";
      return c.html(layout(`${tableName} - ${dbName}`, alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Run query (HTMX partial) ───────────────────────────────────────────

  app.post("/query", async (c) => {
    const dokku = c.get("dokku");
    const dbName = c.req.param("name")!;
    const body = await c.req.parseBody();

    const parsed = sqlQuerySchema.safeParse(body.sql);
    if (!parsed.success) {
      return c.html(alert("error", validationError(parsed.error)));
    }

    try {
      const start = Date.now();
      const result = await dokku.postgresQuery(dbName, parsed.data + ";");
      const elapsed = Date.now() - start;
      return c.html(dbQueryResultPartial(result.columns, result.rows, result.rowCount, elapsed));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      return c.html(alert("error", message));
    }
  });

  return app;
}

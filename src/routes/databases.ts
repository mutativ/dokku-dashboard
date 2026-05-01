import { Hono } from "hono";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { databasesListErrorRows, databasesListPage, databasesListRows } from "../views/pages/databases-list.js";
import { databaseDetailPage } from "../views/pages/database-detail.js";
import { alert } from "../views/components/alert.js";
import { nameSchema } from "../lib/validation.js";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "kB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function loadingPollAttempt(value: string | undefined) {
  const attempt = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(attempt) || attempt < 0) return 0;
  return attempt;
}

export function databasesRoutes() {
  const app = new Hono<AppBindings>();

  // ── List databases ─────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const partial = c.req.query("partial");
    try {
      const [databases, apps] = await Promise.all([
        dokku.databasesListFast(),
        partial === "rows" ? Promise.resolve([]) : dokku.appsListNames(),
      ]);
      const totalBytes = databases.reduce((sum, db) => sum + db.sizeBytes, 0);
      const totalSize = databases.some((db) => db.size === "checking") ? undefined : formatBytes(totalBytes);
      const canMutate = c.get("env").ENABLE_DESTRUCTIVE_ACTIONS;

      if (partial === "rows") {
        return c.html(databasesListRows(databases, canMutate, true, loadingPollAttempt(c.req.query("attempt"))));
      }
      return c.html(layout("Databases", databasesListPage(databases, apps, canMutate, totalSize), "/databases", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list databases";
      if (partial === "rows") return c.html(databasesListErrorRows(message));
      return c.html(layout("Databases", alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Create database ────────────────────────────────────────────────────

  app.post("/create", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect("/databases");
    }
    const dokku = c.get("dokku");
    const body = await c.req.parseBody();
    const parsed = nameSchema.safeParse(body.name);

    if (!parsed.success) {
      return c.redirect("/databases");
    }

    try {
      await dokku.postgresCreate(parsed.data);
    } catch {
      // ignore if already exists
    }
    return c.redirect("/databases");
  });

  // ── Database detail ────────────────────────────────────────────────────

  app.get("/:name", async (c) => {
    const dokku = c.get("dokku");
    const env = c.get("env");
    const name = c.req.param("name");

    try {
      const [info, links, apps] = await Promise.all([
        dokku.postgresInfo(name),
        dokku.postgresLinks(name),
        dokku.appsListNames(),
      ]);

      return c.html(layout(name, databaseDetailPage(name, info, links, apps, env.ENABLE_SQL_EXPLORER, env.ENABLE_DESTRUCTIVE_ACTIONS), "/databases", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get database info";
      return c.html(layout(name, alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Destroy database ───────────────────────────────────────────────────

  app.post("/:name/destroy", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect("/databases");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    try {
      await dokku.postgresDestroy(name);
    } catch {
      // continue
    }
    return c.redirect("/databases");
  });

  // ── Link ───────────────────────────────────────────────────────────────

  app.post("/:name/link", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/databases/${c.req.param("name")}`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    const body = await c.req.parseBody();
    const parsed = nameSchema.safeParse(body.app);

    if (parsed.success) {
      try {
        await dokku.postgresLink(name, parsed.data);
      } catch {
        // continue
      }
    }
    return c.redirect(`/databases/${name}`);
  });

  // ── Unlink ─────────────────────────────────────────────────────────────

  app.post("/:name/unlink", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/databases/${c.req.param("name")}`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    const body = await c.req.parseBody();
    const parsed = nameSchema.safeParse(body.app);

    if (parsed.success) {
      try {
        await dokku.postgresUnlink(name, parsed.data);
      } catch {
        // continue
      }
    }
    return c.redirect(`/databases/${name}`);
  });

  return app;
}

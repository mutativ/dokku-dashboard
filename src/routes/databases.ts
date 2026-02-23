import { Hono } from "hono";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { databasesListPage } from "../views/pages/databases-list.js";
import { databaseDetailPage } from "../views/pages/database-detail.js";
import { alert } from "../views/components/alert.js";
import { nameSchema } from "../lib/validation.js";

export function databasesRoutes() {
  const app = new Hono<AppBindings>();

  // ── List databases ─────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    try {
      const names = await dokku.postgresList();
      const apps = await dokku.appsListNames();

      const databases = await Promise.all(
        names.map(async (name) => ({
          name,
          links: await dokku.postgresLinks(name),
        })),
      );

      return c.html(layout("Databases", databasesListPage(databases, apps), "/databases", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list databases";
      return c.html(layout("Databases", alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Create database ────────────────────────────────────────────────────

  app.post("/create", async (c) => {
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

      return c.html(layout(name, databaseDetailPage(name, info, links, apps, env.ENABLE_SQL_EXPLORER), "/databases", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get database info";
      return c.html(layout(name, alert("error", message), "/databases", c.get("userEmail")));
    }
  });

  // ── Destroy database ───────────────────────────────────────────────────

  app.post("/:name/destroy", async (c) => {
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

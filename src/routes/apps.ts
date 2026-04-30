import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppBindings } from "../server.js";
import type { AppInfo, AppMeta } from "../lib/dokku.js";
import { layout } from "../views/layout.js";
import { appsListErrorRows, appsListPage, appsListRows } from "../views/pages/apps-list.js";
import { appDetailPage, appInfoPartial, appLogsPartial } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { toastOob } from "../views/components/toast.js";
import { nameSchema } from "../lib/validation.js";

function isHtmx(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("HX-Request") === "true";
}

function mutationsEnabled(c: { get: (key: "env") => { ENABLE_DESTRUCTIVE_ACTIONS: boolean } }) {
  return c.get("env").ENABLE_DESTRUCTIVE_ACTIONS;
}

function friendlyAppsError(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (/timed out/i.test(message)) {
    return "Dokku is taking longer than expected. Showing cached app data when available.";
  }
  return "Unable to refresh the app list right now.";
}

function appInfoFromMeta(name: string, meta: AppMeta, domains: string[] = []): AppInfo {
  const isRunning = meta.psReport.Running?.toLowerCase() === "true";
  const isDeployed = meta.psReport.Deployed?.toLowerCase() === "true";
  const status = isRunning ? "running" : isDeployed ? "stopped" : "not deployed";
  const processTypeCounts: Record<string, number> = {};

  for (const process of meta.processes) {
    processTypeCounts[process.type] = (processTypeCounts[process.type] ?? 0) + 1;
  }

  return {
    name,
    status,
    deployed: isDeployed || isRunning,
    processCount: meta.processes.length,
    processTypes: Object.keys(processTypeCounts),
    processTypeCounts,
    domains,
    appType: meta.appType,
  };
}

export function appsRoutes() {
  const app = new Hono<AppBindings>();

  // ── List apps ──────────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const partial = c.req.query("partial");
    try {
      const apps = partial === "rows" ? await dokku.appsList() : await dokku.appsListFast();
      const canMutate = mutationsEnabled(c);
      if (partial === "rows") return c.html(appsListRows(apps, canMutate));
      return c.html(layout("Apps", appsListPage(apps, canMutate), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = friendlyAppsError(err);
      if (partial === "rows") return c.html(appsListErrorRows(message));
      return c.html(layout("Apps", alert("error", message), "/apps", c.get("userEmail")));
    }
  });

  // ── Create app ─────────────────────────────────────────────────────────

  app.post("/create", async (c) => {
    if (!mutationsEnabled(c)) {
      return c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const body = await c.req.parseBody();
    const parsed = nameSchema.safeParse(body.name);

    if (!parsed.success) {
      return c.redirect("/apps");
    }

    try {
      await dokku.appsCreate(parsed.data);
    } catch {
      // ignore if already exists
    }
    return c.redirect("/apps");
  });

  // ── App detail ─────────────────────────────────────────────────────────

  app.get("/:name", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    const partial = c.req.query("partial");

    try {
      const [meta, domains] = await Promise.all([
        dokku.getAppMeta(name),
        dokku.domainsReport(name).catch(() => []),
      ]);
      const appInfo = appInfoFromMeta(name, meta, domains);
      const content = appInfoPartial(name, meta);
      const canMutate = mutationsEnabled(c);

      if (partial === "1") return c.html(content);
      return c.html(
        layout(name, appDetailPage(name, "info", content, appInfo, canMutate), "/apps", c.get("userEmail")),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get app info";
      return c.html(layout(name, alert("error", message), "/apps", c.get("userEmail")));
    }
  });

  // ── Restart / Stop / Start / Rebuild ─────────────────────────────────

  function isSelf(c: { get: (key: "env") => { DOKKU_APP_NAME: string } }, name: string) {
    return name === c.get("env").DOKKU_APP_NAME;
  }

  app.post("/:name/restart", async (c) => {
    if (!mutationsEnabled(c)) {
      return isHtmx(c) ? c.html(toastOob("error", "View-only mode: action disabled")) : c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    // Self-restart: fire-and-forget, respond before we die
    if (isSelf(c, name) && isHtmx(c)) {
      dokku.psRestart(name).catch(() => {});
      c.header("X-Self-Restart", "true");
      return c.html(toastOob("success", "Restarting dashboard..."));
    }
    try {
      await dokku.psRestart(name);
      if (isHtmx(c)) {
        c.header("HX-Trigger", "refreshAppList");
        return c.html(toastOob("success", `${name} restarted`));
      }
    } catch (err) {
      if (isHtmx(c)) {
        return c.html(toastOob("error", `Failed to restart ${name}`));
      }
    }
    return c.redirect("/apps");
  });

  app.post("/:name/stop", async (c) => {
    if (!mutationsEnabled(c)) {
      return isHtmx(c) ? c.html(toastOob("error", "View-only mode: action disabled")) : c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    if (isSelf(c, name) && isHtmx(c)) {
      return c.html(toastOob("error", "Cannot stop the dashboard from itself. Use CLI: dokku ps:stop " + name));
    }
    try {
      await dokku.psStop(name);
      if (isHtmx(c)) {
        c.header("HX-Trigger", "refreshAppList");
        return c.html(toastOob("success", `${name} stopped`));
      }
    } catch (err) {
      if (isHtmx(c)) {
        return c.html(toastOob("error", `Failed to stop ${name}`));
      }
    }
    return c.redirect("/apps");
  });

  app.post("/:name/start", async (c) => {
    if (!mutationsEnabled(c)) {
      return isHtmx(c) ? c.html(toastOob("error", "View-only mode: action disabled")) : c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    try {
      await dokku.psStart(name);
      if (isHtmx(c)) {
        c.header("HX-Trigger", "refreshAppList");
        return c.html(toastOob("success", `${name} started`));
      }
    } catch (err) {
      if (isHtmx(c)) {
        return c.html(toastOob("error", `Failed to start ${name}`));
      }
    }
    return c.redirect("/apps");
  });

  app.post("/:name/rebuild", async (c) => {
    if (!mutationsEnabled(c)) {
      return isHtmx(c) ? c.html(toastOob("error", "View-only mode: action disabled")) : c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    if (isSelf(c, name) && isHtmx(c)) {
      dokku.psRebuild(name).catch(() => {});
      c.header("X-Self-Restart", "true");
      return c.html(toastOob("success", "Rebuilding dashboard..."));
    }
    try {
      await dokku.psRebuild(name);
      if (isHtmx(c)) {
        c.header("HX-Trigger", "refreshAppList");
        return c.html(toastOob("success", `${name} rebuild complete`));
      }
    } catch (err) {
      if (isHtmx(c)) {
        return c.html(toastOob("error", `Failed to rebuild ${name}`));
      }
    }
    return c.redirect("/apps");
  });

  // ── Destroy app ────────────────────────────────────────────────────────

  app.post("/:name/destroy", async (c) => {
    if (!mutationsEnabled(c)) {
      return c.redirect("/apps");
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    try {
      await dokku.appsDestroy(name);
    } catch {
      // continue
    }
    return c.redirect("/apps");
  });

  // ── Logs page ──────────────────────────────────────────────────────────

  app.get("/:name/logs", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name");
    const partial = c.req.query("partial");

    const content = appLogsPartial(name);
    if (partial === "1") return c.html(content);

    const appInfo = await dokku.appInfo(name).catch(() => undefined);
    const canMutate = mutationsEnabled(c);
    return c.html(
      layout(name, appDetailPage(name, "logs", content, appInfo, canMutate), "/apps", c.get("userEmail")),
    );
  });

  // ── SSE log stream ─────────────────────────────────────────────────────

  app.get("/:name/logs/stream", (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name");

    return streamSSE(c, async (stream) => {
      let id = 0;
      // Strip ANSI escape sequences and terminal control codes from log output.
      // Apps like Envio indexers spam cursor-movement sequences (~10×/s) that
      // generate thousands of junk SSE events and freeze the browser tab.
      const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\[[\d;]*m/g;
      // Lines that are purely whitespace or cursor-control artefacts after stripping
      const emptyAfterStrip = /^\s*$/;

      const { abort } = dokku.streamLogs(
        name,
        (chunk) => {
          const lines = chunk
            .replace(ansiRegex, "")
            .split("\n")
            .filter((l) => !emptyAfterStrip.test(l));
          for (const line of lines) {
            stream
              .writeSSE({ data: line, event: "log", id: String(++id) })
              .catch(() => {});
          }
        },
        () => {
          stream
            .writeSSE({ data: "[stream closed]", event: "log", id: String(++id) })
            .catch(() => {});
        },
      );

      stream.onAbort(() => {
        abort();
      });

      // Keep connection alive
      while (true) {
        await stream.sleep(15_000);
      }
    });
  });

  return app;
}

import { Hono } from "hono";
import { html } from "hono/html";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { appDetailPage } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { processTypeSchema, scaleCountSchema, resourceValueSchema } from "../lib/validation.js";

function scalingPartial(
  appName: string,
  scaleOutput: string,
  resourceOutput: string,
  enableDestructiveActions: boolean,
) {
  // Parse ps:scale output
  const scaleLines = scaleOutput.trim().split("\n");
  const processes: Array<{ type: string; count: string }> = [];
  for (const line of scaleLines) {
    if (line.startsWith("====") || line.startsWith("---")) continue;
    const match = line.match(/^\s*(\w+):\s*(\d+)/);
    if (match) {
      processes.push({ type: match[1], count: match[2] });
    }
  }

  // Parse resource:report output
  const resourceLines = resourceOutput.trim().split("\n");
  const resources: Array<[string, string]> = [];
  for (const line of resourceLines) {
    if (line.startsWith("====")) continue;
    const match = line.match(/^\s*(.+?):\s+(.*)$/);
    if (match) {
      resources.push([match[1].trim(), match[2].trim()]);
    }
  }

  return html`
    <section class="dk-card">
      <header class="dk-card-h">
        <div class="dk-card-title">Process scaling</div>
        <div class="dk-card-meta">${processes.length} process type${processes.length === 1 ? "" : "s"}</div>
      </header>
      ${processes.length > 0
        ? html`
            <div class="dk-scale-grid">
              ${processes.map((p) => html`
                <div class="dk-scale-tile">
                  <div class="dk-scale-tile-name">${p.type}</div>
                  <div class="dk-scale-tile-count">${p.count}</div>
                  <div class="dk-scale-tile-meta">${p.count} ${p.count === "1" ? "container" : "containers"} running</div>
                </div>
              `)}
            </div>
          `
        : html`<div class="dk-empty">No processes configured. Deploy the app first.</div>`}
      ${enableDestructiveActions && processes.length > 0
        ? html`
            <form method="POST" action="/apps/${appName}/scaling/scale" style="display:flex;gap:8px;padding:12px 16px;align-items:flex-end;flex-wrap:wrap;border-top:1px solid var(--line)">
              ${processes.map((p) => html`
                <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                  ${p.type}
                  <input type="number" name="${p.type}" value="${p.count}" min="0" max="20"
                    style="width:80px;padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none;color:var(--ink)">
                </label>
              `)}
              <button type="submit" class="dk-btn dk-btn-primary" style="margin-left:auto">Apply scale</button>
            </form>
          `
        : html``}
    </section>

    ${enableDestructiveActions
      ? html`
          <section class="dk-card">
            <header class="dk-card-h"><div class="dk-card-title">Resource limits</div></header>
            <form method="POST" action="/apps/${appName}/scaling/resources" style="display:flex;gap:8px;padding:12px 16px;align-items:flex-end;flex-wrap:wrap">
              <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                process type
                <input type="text" name="process_type" value="web"
                  style="width:120px;padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                memory
                <input type="text" name="memory" placeholder="512m"
                  style="width:120px;padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none">
              </label>
              <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                cpu
                <input type="text" name="cpu" placeholder="1"
                  style="width:120px;padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none">
              </label>
              <button type="submit" class="dk-btn dk-btn-primary">Set limits</button>
            </form>
          </section>
        `
      : html``}

    <section class="dk-card">
      <header class="dk-card-h"><div class="dk-card-title">Resource report</div></header>
      ${resources.length === 0
        ? html`<div class="dk-empty">No resource limits configured</div>`
        : html`${resources.map(([key, val]) => html`
            <div class="dk-kv">
              <div class="dk-kv-k">${key}</div>
              <div class="dk-kv-v">${val || "—"}</div>
              <div></div>
            </div>
          `)}`}
    </section>
  `;
}

export function scalingRoutes() {
  const app = new Hono<AppBindings>();

  // ── Show scaling ───────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const partial = c.req.query("partial");

    try {
      const [scaleOutput, resourceOutput, appInfo] = await Promise.all([
        dokku.psScale(name).catch(() => ""),
        dokku.resourceReport(name).catch(() => ""),
        partial === "1" ? Promise.resolve(undefined) : dokku.appInfo(name).catch(() => undefined),
      ]);
      const canMutate = c.get("env").ENABLE_DESTRUCTIVE_ACTIONS;

      const content = scalingPartial(name, scaleOutput, resourceOutput, canMutate);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "scaling", content, appInfo, canMutate), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get scaling info";
      const content = alert("error", message);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "scaling", content, undefined, c.get("env").ENABLE_DESTRUCTIVE_ACTIONS), "/apps", c.get("userEmail")));
    }
  });

  // ── Apply scale ────────────────────────────────────────────────────────

  app.post("/scale", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/scaling`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();

    const scaling: Record<string, number> = {};
    for (const [key, val] of Object.entries(body)) {
      if (key === "_csrf") continue;
      const keyResult = processTypeSchema.safeParse(key);
      const valResult = scaleCountSchema.safeParse(val);
      if (keyResult.success && valResult.success) {
        scaling[keyResult.data] = valResult.data;
      }
    }

    if (Object.keys(scaling).length > 0) {
      try {
        await dokku.psScale(name, scaling);
      } catch {
        // continue
      }
    }
    return c.redirect(`/apps/${name}/scaling`);
  });

  // ── Set resource limits ────────────────────────────────────────────────

  app.post("/resources", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/scaling`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();

    const ptResult = processTypeSchema.safeParse(body.process_type || "web");
    const processType = ptResult.success ? ptResult.data : "web";

    const memResult = typeof body.memory === "string" && body.memory.trim()
      ? resourceValueSchema.safeParse(body.memory)
      : null;
    const cpuResult = typeof body.cpu === "string" && body.cpu.trim()
      ? resourceValueSchema.safeParse(body.cpu)
      : null;

    const memory = memResult?.success ? memResult.data : undefined;
    const cpu = cpuResult?.success ? cpuResult.data : undefined;

    if (memory || cpu) {
      try {
        await dokku.resourceLimitSet(name, processType, { memory, cpu });
      } catch {
        // continue
      }
    }
    return c.redirect(`/apps/${name}/scaling`);
  });

  return app;
}

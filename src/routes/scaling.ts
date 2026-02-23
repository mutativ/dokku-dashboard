import { Hono } from "hono";
import { html } from "hono/html";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { appDetailPage } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { processTypeSchema, scaleCountSchema, resourceValueSchema } from "../lib/validation.js";

function scalingPartial(appName: string, scaleOutput: string, resourceOutput: string) {
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
    <!-- Scale processes -->
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Scale Processes</h3>
      <form method="POST" action="/apps/${appName}/scaling/scale" class="space-y-3">
        ${processes.length > 0
          ? processes.map(
              (p) => html`
                <div class="flex gap-3 items-center">
                  <label class="w-24 text-sm text-gray-500">${p.type}</label>
                  <input type="number" name="${p.type}" value="${p.count}" min="0" max="20"
                    class="w-24 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              `,
            )
          : html`<p class="text-sm text-gray-400">No processes configured. Deploy the app first.</p>`}
        ${processes.length > 0
          ? html`
              <button type="submit"
                class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors mt-2">
                Apply Scale
              </button>
            `
          : html``}
      </form>
    </div>

    <!-- Set resource limits -->
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Set Resource Limits</h3>
      <form method="POST" action="/apps/${appName}/scaling/resources" class="flex gap-3 items-end flex-wrap">
        <div>
          <label class="block mb-1 text-xs text-gray-400">Process Type</label>
          <input type="text" name="process_type" value="web"
            class="w-32 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block mb-1 text-xs text-gray-400">Memory (e.g. 512m)</label>
          <input type="text" name="memory" placeholder="512m"
            class="w-32 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block mb-1 text-xs text-gray-400">CPU (e.g. 1)</label>
          <input type="text" name="cpu" placeholder="1"
            class="w-32 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <button type="submit"
          class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
          Set Limits
        </button>
      </form>
    </div>

    <!-- Current resource report -->
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 class="text-sm font-semibold text-gray-700">Resource Report</h3>
      </div>
      ${resources.length === 0
        ? html`<div class="px-4 py-6 text-center text-gray-400 text-sm">No resource limits configured</div>`
        : html`
            <div class="divide-y divide-gray-100">
              ${resources.map(
                ([key, val]) => html`
                  <div class="flex px-4 py-2.5 text-sm">
                    <span class="w-64 text-gray-400 shrink-0">${key}</span>
                    <span class="text-gray-700 font-mono text-xs">${val || "-"}</span>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
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
      const [scaleOutput, resourceOutput, apps] = await Promise.all([
        dokku.psScale(name).catch(() => ""),
        dokku.resourceReport(name).catch(() => ""),
        dokku.appsList(),
      ]);
      const appInfo = apps.find((a) => a.name === name);

      const content = scalingPartial(name, scaleOutput, resourceOutput);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "scaling", content, appInfo), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get scaling info";
      const content = alert("error", message);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "scaling", content), "/apps", c.get("userEmail")));
    }
  });

  // ── Apply scale ────────────────────────────────────────────────────────

  app.post("/scale", async (c) => {
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

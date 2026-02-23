import { Hono } from "hono";
import { html } from "hono/html";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { appDetailPage } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { envKeySchema, envValueSchema } from "../lib/validation.js";

const SENSITIVE_PATTERNS = /KEY|SECRET|HASH|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|DSN/i;

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.test(key);
}

function envPartial(appName: string, vars: Record<string, string>, message?: { type: "success" | "error"; text: string }) {
  const entries = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));

  return html`
    ${message ? alert(message.type, message.text) : html``}

    <!-- Set env var form -->
    <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Set Environment Variable</h3>
      <form method="POST" action="/apps/${appName}/env/set" class="flex gap-3 items-end">
        <div class="flex-1">
          <label class="block mb-1 text-xs text-gray-400">Key</label>
          <input type="text" name="key" required pattern="[A-Z_][A-Z0-9_]*"
            class="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="MY_VAR">
        </div>
        <div class="flex-1">
          <label class="block mb-1 text-xs text-gray-400">Value</label>
          <input type="text" name="value" required
            class="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="value">
        </div>
        <div class="flex gap-2">
          <label class="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" name="no_restart" class="rounded border-gray-300">
            No restart
          </label>
          <button type="submit"
            class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors whitespace-nowrap">Set</button>
        </div>
      </form>
    </div>

    <!-- Current env vars -->
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 class="text-sm font-semibold text-gray-700">${entries.length} Environment Variables</h3>
      </div>
      ${entries.length === 0
        ? html`<div class="px-4 py-6 text-center text-gray-400 text-sm">No environment variables set</div>`
        : html`
            <div class="divide-y divide-gray-100">
              ${entries.map(
                ([key, val]) => {
                  const sensitive = isSensitive(key);
                  const masked = sensitive ? val.slice(0, 4) + "..." + val.slice(-4) : val;
                  const id = `env-${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
                  return html`
                    <div class="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50">
                      <div class="flex-1 min-w-0">
                        <span class="text-sm font-mono text-blue-600">${key}</span>
                        <span class="text-gray-300 mx-2">=</span>
                        <span id="${id}" class="text-sm font-mono text-gray-600 break-all">${masked}</span>
                        ${sensitive
                          ? html`<span class="hidden" id="${id}-full">${val}</span>
                                 <button onclick="var s=document.getElementById('${id}'),f=document.getElementById('${id}-full'),t=this;if(t.dataset.shown){s.textContent=t.dataset.masked;t.textContent='show';delete t.dataset.shown}else{s.textContent=f.textContent;t.textContent='hide';t.dataset.shown='1';t.dataset.masked=s.textContent.length!==f.textContent.length?'${masked}':s.textContent}"
                                   class="ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">show</button>`
                          : html``}
                      </div>
                      <form method="POST" action="/apps/${appName}/env/unset" class="shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <input type="hidden" name="key" value="${key}">
                        <button class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors">Unset</button>
                      </form>
                    </div>
                  `;
                },
              )}
            </div>
          `}
    </div>
  `;
}

export function envRoutes() {
  const app = new Hono<AppBindings>();

  // ── Show env vars ──────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const partial = c.req.query("partial");

    try {
      const [vars, apps] = await Promise.all([dokku.configShow(name), dokku.appsList()]);
      const appInfo = apps.find((a) => a.name === name);
      const content = envPartial(name, vars);

      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "env", content, appInfo), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get env vars";
      const content = alert("error", message);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "env", content), "/apps", c.get("userEmail")));
    }
  });

  // ── Set env var ────────────────────────────────────────────────────────

  app.post("/set", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();
    const noRestart = body.no_restart === "on";

    const keyResult = envKeySchema.safeParse(body.key);
    const valResult = envValueSchema.safeParse(body.value);

    if (!keyResult.success || !valResult.success) {
      return c.redirect(`/apps/${name}/env`);
    }

    try {
      await dokku.configSet(name, { [keyResult.data]: valResult.data }, noRestart);
    } catch {
      // continue
    }
    return c.redirect(`/apps/${name}/env`);
  });

  // ── Unset env var ──────────────────────────────────────────────────────

  app.post("/unset", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();
    const keyResult = envKeySchema.safeParse(body.key);

    if (!keyResult.success) {
      return c.redirect(`/apps/${name}/env`);
    }

    try {
      await dokku.configUnset(name, [keyResult.data]);
    } catch {
      // continue
    }
    return c.redirect(`/apps/${name}/env`);
  });

  return app;
}

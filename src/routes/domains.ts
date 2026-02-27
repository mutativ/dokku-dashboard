import { Hono } from "hono";
import { html } from "hono/html";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { appDetailPage } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { domainSchema } from "../lib/validation.js";

function domainsPartial(appName: string, domains: string[], enableDestructiveActions: boolean) {
  return html`
    ${enableDestructiveActions
      ? html`
          <!-- Add domain form -->
          <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Add Domain</h3>
            <form method="POST" action="/apps/${appName}/domains/add" class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="block mb-1 text-xs text-gray-400">Domain</label>
                <input type="text" name="domain" required
                  class="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="app.example.com">
              </div>
              <button type="submit"
                class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">Add</button>
            </form>
          </div>
        `
      : html`<div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-6 text-xs text-gray-500">View-only mode: domain updates are disabled.</div>`}

    <!-- SSL -->
    ${enableDestructiveActions
      ? html`
          <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">SSL / Let's Encrypt</h3>
            <div class="flex gap-3">
              <form method="POST" action="/apps/${appName}/domains/ssl/enable">
                <button class="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Enable Let's Encrypt
                </button>
              </form>
              <form method="POST" action="/apps/${appName}/domains/ssl/disable">
                <button class="bg-gray-200 hover:bg-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Disable Let's Encrypt
                </button>
              </form>
            </div>
          </div>
        `
      : html``}

    <!-- Current domains -->
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 class="text-sm font-semibold text-gray-700">${domains.length} Domains</h3>
      </div>
      ${domains.length === 0
        ? html`<div class="px-4 py-6 text-center text-gray-400 text-sm">No domains configured</div>`
        : html`
            <div class="divide-y divide-gray-100">
              ${domains.map(
                (domain) => html`
                  <div class="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50">
                    <a href="https://${domain}" target="_blank" rel="noopener" class="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline">${domain}</a>
                    ${enableDestructiveActions
                      ? html`<form method="POST" action="/apps/${appName}/domains/remove" class="opacity-0 group-hover:opacity-100 transition-opacity">
                          <input type="hidden" name="domain" value="${domain}">
                          <button class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors">Remove</button>
                        </form>`
                      : html``}
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

export function domainsRoutes() {
  const app = new Hono<AppBindings>();

  // ── Show domains ───────────────────────────────────────────────────────

  app.get("/", async (c) => {
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const partial = c.req.query("partial");

    try {
      const canMutate = c.get("env").ENABLE_DESTRUCTIVE_ACTIONS;
      const [domains, apps] = await Promise.all([dokku.domainsReport(name), dokku.appsList()]);
      const appInfo = apps.find((a) => a.name === name);
      const content = domainsPartial(name, domains, canMutate);

      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "domains", content, appInfo, canMutate), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get domains";
      const content = alert("error", message);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "domains", content, undefined, c.get("env").ENABLE_DESTRUCTIVE_ACTIONS), "/apps", c.get("userEmail")));
    }
  });

  // ── Add domain ─────────────────────────────────────────────────────────

  app.post("/add", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/domains`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();
    const parsed = domainSchema.safeParse(body.domain);

    if (parsed.success) {
      try {
        await dokku.domainsAdd(name, parsed.data);
      } catch {
        // continue
      }
    }
    return c.redirect(`/apps/${name}/domains`);
  });

  // ── Remove domain ──────────────────────────────────────────────────────

  app.post("/remove", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/domains`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    const body = await c.req.parseBody();
    const parsed = domainSchema.safeParse(body.domain);

    if (parsed.success) {
      try {
        await dokku.domainsRemove(name, parsed.data);
      } catch {
        // continue
      }
    }
    return c.redirect(`/apps/${name}/domains`);
  });

  // ── SSL ────────────────────────────────────────────────────────────────

  app.post("/ssl/enable", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/domains`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    try {
      await dokku.letsencryptEnable(name);
    } catch {
      // continue
    }
    return c.redirect(`/apps/${name}/domains`);
  });

  app.post("/ssl/disable", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/domains`);
    }
    const dokku = c.get("dokku");
    const name = c.req.param("name")!;
    try {
      await dokku.letsencryptDisable(name);
    } catch {
      // continue
    }
    return c.redirect(`/apps/${name}/domains`);
  });

  return app;
}

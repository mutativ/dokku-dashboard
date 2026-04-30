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
          <section class="dk-card">
            <header class="dk-card-h"><div class="dk-card-title">Add domain</div></header>
            <form method="POST" action="/apps/${appName}/domains/add" style="display:flex;gap:8px;padding:12px 16px;align-items:center">
              <input type="text" name="domain" required
                style="flex:1;padding:7px 10px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:12.5px;outline:none"
                placeholder="app.example.com">
              <button type="submit" class="dk-btn dk-btn-primary">Add</button>
            </form>
          </section>

          <section class="dk-card">
            <header class="dk-card-h"><div class="dk-card-title">SSL · Let's Encrypt</div></header>
            <div style="display:flex;gap:8px;padding:12px 16px">
              <form method="POST" action="/apps/${appName}/domains/ssl/enable">
                <button type="submit" class="dk-actbtn dk-actbtn-ok">Enable</button>
              </form>
              <form method="POST" action="/apps/${appName}/domains/ssl/disable">
                <button type="submit" class="dk-actbtn dk-actbtn-neutral">Disable</button>
              </form>
            </div>
          </section>
        `
      : html`<div class="dk-ro-banner" style="margin-bottom:16px">
          <span class="ic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span>View-only mode — domain edits disabled.</span>
        </div>`}

    <section class="dk-card">
      <header class="dk-card-h">
        <div class="dk-card-title">Domains</div>
        <div class="dk-card-meta">${domains.length} ${domains.length === 1 ? "domain" : "domains"}</div>
      </header>
      ${domains.length === 0
        ? html`<div class="dk-empty">No domains configured</div>`
        : html`${domains.map((domain) => html`
            <div class="dk-domain-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3c2.5 3 4 6 4 9s-1.5 6-4 9c-2.5-3-4-6-4-9s1.5-6 4-9z" />
              </svg>
              <span class="dk-domain-name">${domain}</span>
              <a href="https://${domain}" target="_blank" rel="noopener" class="dk-copychip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-8 8" />
                  <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
                </svg>
                visit
              </a>
              ${enableDestructiveActions
                ? html`<form method="POST" action="/apps/${appName}/domains/remove" style="display:inline">
                    <input type="hidden" name="domain" value="${domain}">
                    <button type="submit" class="dk-actbtn dk-actbtn-bad">Remove</button>
                  </form>`
                : html``}
            </div>
          `)}`}
    </section>
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
      const domainsPromise = dokku.domainsReport(name);
      const appInfoPromise = partial === "1"
        ? Promise.resolve(undefined)
        : dokku.appInfo(name).catch(() => undefined);
      const [domains, appInfo] = await Promise.all([domainsPromise, appInfoPromise]);
      if (appInfo) appInfo.domains = domains;
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

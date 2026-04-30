import { Hono } from "hono";
import { html } from "hono/html";
import type { AppBindings } from "../server.js";
import { layout } from "../views/layout.js";
import { appDetailPage } from "../views/pages/app-detail.js";
import { alert } from "../views/components/alert.js";
import { envKeySchema, envValueSchema } from "../lib/validation.js";

const SENSITIVE_KEY_PATTERNS = /KEY|SECRET|HASH|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|DSN/i;
const SENSITIVE_VALUE_PATTERNS = /^[a-z]+:\/\/[^:]+:[^@]+@/i; // URLs with credentials like redis://user:pass@host

function isSensitive(key: string, value: string): boolean {
  return SENSITIVE_KEY_PATTERNS.test(key) || SENSITIVE_VALUE_PATTERNS.test(value) || value.length > 60;
}

function envPartial(
  appName: string,
  vars: Record<string, string>,
  enableDestructiveActions: boolean,
  message?: { type: "success" | "error"; text: string },
) {
  const entries = Object.entries(vars).sort(([a], [b]) => a.localeCompare(b));

  return html`
    ${message ? alert(message.type, message.text) : html``}

    ${enableDestructiveActions
      ? html`
          <section class="dk-card">
            <header class="dk-card-h"><div class="dk-card-title">Set environment variable</div></header>
            <form method="POST" action="/apps/${appName}/env/set" style="display:flex;gap:8px;padding:12px 16px;align-items:flex-end;flex-wrap:wrap">
              <label style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:120px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                key
                <input type="text" name="key" required pattern="[A-Z_][A-Z0-9_]*"
                  style="padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none;color:var(--ink)"
                  placeholder="MY_VAR">
              </label>
              <label style="display:flex;flex-direction:column;gap:4px;flex:2;min-width:160px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                value
                <input type="text" name="value" required
                  style="padding:6px 8px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none;color:var(--ink)"
                  placeholder="value">
              </label>
              <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink-3);font-family:var(--font-mono)">
                <input type="checkbox" name="no_restart"> no restart
              </label>
              <button type="submit" class="dk-btn dk-btn-primary">Set</button>
            </form>
          </section>
        `
      : html`<div class="dk-ro-banner" style="margin-bottom:16px">
          <span class="ic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span>View-only mode — env edits disabled.</span>
        </div>`}

    <section class="dk-card">
      <header class="dk-card-h">
        <div class="dk-card-title">Environment variables</div>
        <div class="dk-card-meta">${entries.length} key${entries.length === 1 ? "" : "s"}</div>
      </header>
      ${entries.length === 0
        ? html`<div class="dk-empty">No environment variables set</div>`
        : html`${entries.map(([key, val]) => {
            const sensitive = isSensitive(key, val);
            const masked = sensitive ? val.slice(0, 4) + "..." + val.slice(-4) : val;
            const id = `env-${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
            return html`
              <div class="dk-kv">
                <div class="dk-kv-k mono" style="color:var(--accent)">${key}</div>
                <div class="dk-kv-v">
                  <span id="${id}">${masked}</span>
                  ${sensitive
                    ? html`<span style="display:none" id="${id}-full">${val}</span>
                           <button type="button" onclick="var s=document.getElementById('${id}'),f=document.getElementById('${id}-full'),t=this;if(t.dataset.shown){s.textContent=t.dataset.masked;t.textContent='show';delete t.dataset.shown}else{s.textContent=f.textContent;t.textContent='hide';t.dataset.shown='1';t.dataset.masked='${masked}'}"
                             class="dk-copychip" style="margin-left:8px">show</button>`
                    : html``}
                </div>
                <div style="display:flex;gap:6px">
                  <button type="button" class="dk-copychip" data-copy="${val}" onclick="(function(b){var v=b.getAttribute('data-copy');navigator.clipboard.writeText(v);var o=b.innerText;b.innerText='Copied';setTimeout(function(){b.innerText=o},1200)})(this)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                    </svg>
                    Copy
                  </button>
                  ${enableDestructiveActions
                    ? html`<form method="POST" action="/apps/${appName}/env/unset" style="display:inline">
                        <input type="hidden" name="key" value="${key}">
                        <button type="submit" class="dk-actbtn dk-actbtn-bad">Unset</button>
                      </form>`
                    : html``}
                </div>
              </div>
            `;
          })}`}
    </section>
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
      const canMutate = c.get("env").ENABLE_DESTRUCTIVE_ACTIONS;
      const varsPromise = dokku.configShow(name);
      const appInfoPromise = partial === "1"
        ? Promise.resolve(undefined)
        : dokku.appInfo(name).catch(() => undefined);
      const [vars, appInfo] = await Promise.all([varsPromise, appInfoPromise]);
      if (appInfo && vars.DOKKU_APP_TYPE) appInfo.appType = vars.DOKKU_APP_TYPE;
      const content = envPartial(name, vars, canMutate);

      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "env", content, appInfo, canMutate), "/apps", c.get("userEmail")));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get env vars";
      const content = alert("error", message);
      if (partial === "1") return c.html(content);
      return c.html(layout(name, appDetailPage(name, "env", content, undefined, c.get("env").ENABLE_DESTRUCTIVE_ACTIONS), "/apps", c.get("userEmail")));
    }
  });

  // ── Set env var ────────────────────────────────────────────────────────

  app.post("/set", async (c) => {
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/env`);
    }
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
    if (!c.get("env").ENABLE_DESTRUCTIVE_ACTIONS) {
      return c.redirect(`/apps/${c.req.param("name")!}/env`);
    }
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

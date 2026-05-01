import { html } from "hono/html";
import type { AppInfo } from "../../lib/dokku.js";
import { pageHeader } from "../components/nav.js";
import { statusBadge } from "../components/badge.js";
import { actionBtn, readonlyChip } from "../components/action-btn.js";

function groupAppsByType(apps: AppInfo[]): Array<{ type: string; apps: AppInfo[] }> {
  const map = new Map<string, AppInfo[]>();
  for (const app of apps) {
    const type = app.appType.trim() || "untyped";
    const group = map.get(type) ?? [];
    if (!map.has(type)) map.set(type, group);
    group.push(app);
  }
  return Array.from(map.entries()).map(([type, groupApps]) => ({ type, apps: groupApps }));
}

function rowActions(app: AppInfo, enableDestructive: boolean) {
  if (app.status === "loading") {
    return html`<span style="color:var(--ink-4);font-size:12px;font-family:var(--font-mono)">checking</span>`;
  }
  if (app.status === "not deployed") {
    return html`<span style="color:var(--ink-4);font-size:12px;font-family:var(--font-mono)">—</span>`;
  }
  if (!enableDestructive) {
    return html`
      <div class="dk-action-row">
        ${readonlyChip("Restart", "warn")}
        ${readonlyChip("Stop",    "neutral")}
        ${readonlyChip("Rebuild", "accent")}
      </div>
    `;
  }
  if (app.status === "running") {
    return html`
      <div class="dk-action-row">
        ${actionBtn(app.name, "restart", "Restart", "", "sm", `Restart ${app.name}?`)}
        ${actionBtn(app.name, "stop",    "Stop",    "", "sm", `Stop ${app.name}?`)}
        ${actionBtn(app.name, "rebuild", "Rebuild", "", "sm", `Rebuild ${app.name}? This may take a few minutes.`)}
      </div>
    `;
  }
  if (app.status === "stopped") {
    return html`
      <div class="dk-action-row">
        ${actionBtn(app.name, "start",   "Start",   "", "sm")}
        ${actionBtn(app.name, "rebuild", "Rebuild", "", "sm", `Rebuild ${app.name}? This may take a few minutes.`)}
      </div>
    `;
  }
  return html``;
}

function appRow(app: AppInfo, enableDestructive: boolean) {
  return html`
    <tr class="${app.status === "loading" ? "dk-row-loading" : ""}">
      <td>
        <a class="dk-app-name" href="/apps/${app.name}">${app.name}</a>
        ${app.domains.length > 0
          ? html`<div class="dk-app-domains">${app.domains.map((d, i) => html`${i > 0 ? " " : ""}<a href="https://${d}" target="_blank" rel="noopener" style="color:inherit">${d}</a>`)}</div>`
          : html``}
      </td>
      <td>${statusBadge(app.status)}</td>
      <td style="text-align:right">${rowActions(app, enableDestructive)}</td>
    </tr>
  `;
}

function hasLoadingApps(apps: AppInfo[]) {
  return apps.some((app) => app.status === "loading");
}

export function appsListRows(apps: AppInfo[], enableDestructiveActions = true, pollWhenLoading = false) {
  const groups = groupAppsByType(apps);
  return html`
    ${groups.map(
    (group) => html`
      <tr class="dk-group-row">
        <td colspan="3">
          ${group.type}
          <span class="dk-group-meta">${group.apps.length} ${group.apps.length === 1 ? "app" : "apps"}</span>
        </td>
      </tr>
      ${group.apps.map((app) => appRow(app, enableDestructiveActions))}
    `,
  )}
    ${pollWhenLoading && hasLoadingApps(apps)
      ? html`
          <tr class="dk-refresh-row"
              hx-get="/apps?partial=rows"
              hx-trigger="load delay:2s"
              hx-target="#app-rows"
              hx-swap="innerHTML">
            <td colspan="3"></td>
          </tr>
        `
      : html``}
  `;
}

export function appsListErrorRows(message: string) {
  return html`
    <tr>
      <td colspan="3">
        <div class="dk-inline-alert">${message}</div>
      </td>
    </tr>
  `;
}

export function appsListPage(apps: AppInfo[], enableDestructiveActions = true) {
  const sub = html`${apps.length} ${apps.length === 1 ? "app" : "apps"} provisioned`;

  const headerActions = enableDestructiveActions
    ? html`
        <button
          onclick="document.getElementById('create-modal').classList.remove('hidden')"
          class="dk-btn dk-btn-primary">
          Create App
        </button>
      `
    : html`<span class="dk-pill dk-pill-muted">View only mode</span>`;

  const banner = enableDestructiveActions
    ? html``
    : html`
        <div class="dk-ro-banner">
          <span class="ic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <span><span class="dk-ro-banner-strong">Read‑only session.</span> Mutating actions (Restart, Stop, Rebuild, Destroy, Create) are disabled. Hover any action button for confirmation.</span>
        </div>
      `;

  return html`
    ${pageHeader("Apps", headerActions, sub)}
    ${banner}

    ${apps.length === 0
      ? html`<div class="dk-card"><div class="dk-empty">No apps found. Create one to get started.</div></div>`
      : html`
          <div class="dk-card" style="padding:0;overflow:hidden">
            <table class="dk-tbl">
              <thead>
                <tr>
                  <th style="width:50%">Name</th>
                  <th style="width:18%">Status</th>
                  <th class="al-r">Actions</th>
                </tr>
              </thead>
              <tbody id="app-rows" hx-get="/apps?partial=rows" hx-trigger="load delay:250ms, refreshAppList from:body" hx-swap="innerHTML">
                ${appsListRows(apps, enableDestructiveActions)}
              </tbody>
            </table>
          </div>
        `}

    ${enableDestructiveActions
      ? html`
          <div id="create-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
              <h3 style="font-weight:600;font-size:16px;margin-bottom:14px">Create App</h3>
              <form method="POST" action="/apps/create">
                <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--ink-3)">App Name</label>
                <input type="text" name="name" required pattern="[a-z][a-z0-9-]*" minlength="2" maxlength="64"
                  style="width:100%;padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none;margin-bottom:6px"
                  placeholder="my-app">
                <p style="font-size:11px;color:var(--ink-4);margin-bottom:14px">Lowercase letters, numbers, hyphens. Must start with a letter.</p>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" onclick="document.getElementById('create-modal').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                  <button type="submit" class="dk-btn dk-btn-primary">Create</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}
  `;
}

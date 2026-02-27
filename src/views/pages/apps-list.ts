import { html } from "hono/html";
import type { AppInfo } from "../../lib/dokku.js";
import { pageHeader } from "../components/nav.js";
import { table } from "../components/table.js";
import { statusBadge } from "../components/badge.js";
import { actionBtn } from "../components/action-btn.js";

function groupAppsByType(apps: AppInfo[]): Array<{ type: string; apps: AppInfo[] }> {
  const map = new Map<string, AppInfo[]>();
  for (const app of apps) {
    const type = app.appType.trim() || "untyped";
    const group = map.get(type) ?? [];
    if (!map.has(type)) map.set(type, group);
    group.push(app);
  }
  return Array.from(map.entries())
    .map(([type, groupApps]) => ({ type, apps: groupApps }));
}

function appRow(app: AppInfo, enableDestructiveActions = true) {
  return html`
    <tr class="hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <a href="/apps/${app.name}" class="text-blue-600 hover:text-blue-800 font-medium">${app.name}</a>
        </div>
        ${app.domains.length > 0
          ? html`<div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">${app.domains.map((d) => html`<a href="https://${d}" target="_blank" rel="noopener" class="text-xs text-gray-500 hover:text-blue-600 hover:underline font-mono leading-tight">${d}</a>`)}</div>`
          : html``}
      </td>
      <td class="px-4 py-3">${statusBadge(app.status)}</td>
      ${enableDestructiveActions
        ? html`<td class="px-4 py-3 text-right">
            <div class="flex gap-2 justify-end">
              ${app.status === "running"
                ? html`
                    ${actionBtn(app.name, "restart", "Restart", "bg-amber-100 hover:bg-amber-200 text-amber-700", "sm", `Restart ${app.name}?`)}
                    ${actionBtn(app.name, "stop", "Stop", "bg-red-100 hover:bg-red-200 text-red-700", "sm", `Stop ${app.name}?`)}
                    ${actionBtn(app.name, "rebuild", "Rebuild", "bg-purple-100 hover:bg-purple-200 text-purple-700", "sm", `Rebuild ${app.name}? This may take a few minutes.`)}
                  `
                : app.status === "stopped"
                  ? html`
                      ${actionBtn(app.name, "start", "Start", "bg-green-100 hover:bg-green-200 text-green-700", "sm")}
                      ${actionBtn(app.name, "rebuild", "Rebuild", "bg-purple-100 hover:bg-purple-200 text-purple-700", "sm", `Rebuild ${app.name}? This may take a few minutes.`)}
                    `
                  : html``}
            </div>
          </td>`
        : html``}
    </tr>
  `;
}

export function appsListRows(apps: AppInfo[], enableDestructiveActions = true) {
  const groups = groupAppsByType(apps);
  const colspan = enableDestructiveActions ? 3 : 2;
  return html`${groups.map(
    (group) => html`
      <tr class="bg-gray-50 border-t-2 border-gray-200">
        <td colspan="${colspan}" class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">${group.type}</td>
      </tr>
      ${group.apps.map((app) => appRow(app, enableDestructiveActions))}
    `,
  )}`;
}

export function appsListPage(apps: AppInfo[], enableDestructiveActions = true) {
  const header = pageHeader(
    "Apps",
    enableDestructiveActions
      ? html`
          <button
            onclick="document.getElementById('create-modal').classList.remove('hidden')"
            class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
            Create App
          </button>
        `
      : html`<span class="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">View only mode</span>`,
  );

  const columns = enableDestructiveActions
    ? [
        { header: "Name" },
        { header: "Status" },
        { header: "Actions", class: "text-right" },
      ]
    : [
        { header: "Name" },
        { header: "Status" },
      ];

  return html`
    ${header}

    ${apps.length === 0
      ? html`<div class="text-center py-12 text-gray-400">No apps found. Create one to get started.</div>`
      : table(
          columns,
          [html`<tbody id="app-rows" hx-get="/apps?partial=rows" hx-trigger="refreshAppList from:body" hx-swap="innerHTML" class="divide-y divide-gray-100">${appsListRows(apps, enableDestructiveActions)}</tbody>`],
          true,
        )}

    ${enableDestructiveActions
      ? html`
          <!-- Create App Modal -->
          <div id="create-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
              <h3 class="text-lg font-bold text-gray-900 mb-4">Create App</h3>
              <form method="POST" action="/apps/create">
                <label class="block mb-2 text-sm font-medium text-gray-600">App Name</label>
                <input type="text" name="name" required pattern="[a-z][a-z0-9-]*" minlength="2" maxlength="64"
                  class="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg mb-1 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-app">
                <p class="text-xs text-gray-400 mb-4">Lowercase letters, numbers, hyphens. Must start with a letter.</p>
                <div class="flex gap-3 justify-end">
                  <button type="button" onclick="document.getElementById('create-modal').classList.add('hidden')"
                    class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <button type="submit"
                    class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">Create</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}
  `;
}

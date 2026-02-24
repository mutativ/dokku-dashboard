import { html } from "hono/html";
import type { AppInfo } from "../../lib/dokku.js";
import { pageHeader } from "../components/nav.js";
import { table } from "../components/table.js";
import { statusBadge, processBadge } from "../components/badge.js";
import { actionBtn } from "../components/action-btn.js";

function appPrefix(name: string): string {
  const idx = name.indexOf("-");
  return idx > 0 ? name.slice(0, idx) : name;
}

function groupAppsByPrefix(apps: AppInfo[]): Array<{ prefix: string; apps: AppInfo[]; showHeader: boolean }> {
  const map = new Map<string, AppInfo[]>();
  for (const app of apps) {
    const prefix = appPrefix(app.name);
    const group = map.get(prefix) ?? [];
    group.push(app);
    map.set(prefix, group);
  }
  return Array.from(map.entries()).map(([prefix, groupApps]) => ({
    prefix,
    apps: groupApps,
    showHeader: groupApps.length > 1,
  }));
}

function appRow(app: AppInfo) {
  return html`
    <tr class="hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3">
        <a href="/apps/${app.name}" class="text-blue-600 hover:text-blue-800 font-medium">${app.name}</a>
        ${app.domains.length > 0
          ? html`<div class="flex flex-wrap gap-1 mt-0.5">${app.domains.map((d) => html`<a href="https://${d}" target="_blank" rel="noopener" class="text-[11px] text-gray-400 hover:text-blue-500 font-mono leading-none">${d}</a>`)}</div>`
          : html``}
      </td>
      <td class="px-4 py-3">${statusBadge(app.status)}</td>
      <td class="px-4 py-3">
        ${app.processTypes.length > 0
          ? html`<div class="flex gap-1 flex-wrap">${app.processTypes.map((t) =>
              processBadge(t, app.processTypeCounts[t] ?? 0),
            )}</div>`
          : html`<span class="text-gray-400 text-xs">\u2014</span>`}
      </td>
      <td class="px-4 py-3 text-right">
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
      </td>
    </tr>
  `;
}

export function appsListRows(apps: AppInfo[]) {
  const groups = groupAppsByPrefix(apps);
  return html`${groups.map(
    (group) => html`
      ${group.showHeader
        ? html`<tr class="bg-gray-50 border-t-2 border-gray-200"><td colspan="4" class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">${group.prefix}</td></tr>`
        : html``}
      ${group.apps.map(appRow)}
    `,
  )}`;
}

export function appsListPage(apps: AppInfo[]) {
  const header = pageHeader(
    "Apps",
    html`
      <button
        onclick="document.getElementById('create-modal').classList.remove('hidden')"
        class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
        Create App
      </button>
    `,
  );

  return html`
    ${header}

    ${apps.length === 0
      ? html`<div class="text-center py-12 text-gray-400">No apps found. Create one to get started.</div>`
      : table(
          [
            { header: "Name" },
            { header: "Status" },
            { header: "Processes" },
            { header: "Actions", class: "text-right" },
          ],
          [html`<tbody id="app-rows" hx-get="/apps?partial=rows" hx-trigger="refreshAppList from:body" hx-swap="innerHTML" class="divide-y divide-gray-100">${appsListRows(apps)}</tbody>`],
          true,
        )}

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
  `;
}

import { html } from "hono/html";
import { pageHeader } from "../components/nav.js";

export function databaseDetailPage(
  name: string,
  info: string,
  links: string[],
  apps: string[],
  showExplorer = false,
  enableDestructiveActions = true,
) {
  // Parse info output into key-value pairs
  const lines = info.trim().split("\n");
  const pairs: Array<[string, string]> = [];
  for (const line of lines) {
    if (line.startsWith("====")) continue;
    const match = line.match(/^\s*(.+?):\s+(.*)$/);
    if (match) {
      pairs.push([match[1].trim(), match[2].trim()]);
    }
  }

  return html`
    ${pageHeader(
      name,
      html`
        <div class="flex items-center gap-3">
          <a href="/databases" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Back to databases</a>
          ${showExplorer ? html`<a href="/databases/${name}/explore" class="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg transition-colors">Explore</a>` : ""}
        </div>
      `,
    )}

    <div class="grid gap-6">
      <!-- Info -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Database Info</h3>
        </div>
        <div class="divide-y divide-gray-100">
          ${pairs.map(
            ([key, val]) => html`
              <div class="flex px-4 py-2.5 text-sm">
                <span class="w-48 text-gray-400 shrink-0">${key}</span>
                <span class="text-gray-700 font-mono text-xs break-all">${val || "-"}</span>
              </div>
            `,
          )}
        </div>
      </div>

      <!-- Linked Apps -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">Linked Apps</h3>
          ${enableDestructiveActions
            ? html`<button onclick="document.getElementById('link-db-modal').classList.remove('hidden')"
                class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2.5 py-1 rounded transition-colors">
                Link App
              </button>`
            : html`<span class="text-xs text-gray-400">View only</span>`}
        </div>
        ${links.length === 0
          ? html`<div class="px-4 py-6 text-center text-gray-400 text-sm">No linked apps</div>`
          : html`
              <div class="divide-y divide-gray-100">
                ${links.map(
                  (link) => html`
                    <div class="flex items-center justify-between px-4 py-2.5">
                      <a href="/apps/${link}" class="text-blue-600 hover:text-blue-800 text-sm">${link}</a>
                      ${enableDestructiveActions
                        ? html`<form method="POST" action="/databases/${name}/unlink">
                            <input type="hidden" name="app" value="${link}">
                            <button class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded transition-colors">Unlink</button>
                          </form>`
                        : html``}
                    </div>
                  `,
                )}
              </div>
            `}
      </div>
    </div>

    ${enableDestructiveActions
      ? html`
          <!-- Link Modal -->
          <div id="link-db-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
              <h3 class="text-lg font-bold text-gray-900 mb-4">Link ${name} to App</h3>
              <form method="POST" action="/databases/${name}/link">
                <label class="block mb-2 text-sm font-medium text-gray-600">App</label>
                <select name="app" required
                  class="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg mb-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  ${apps.map((a) => html`<option value="${a}">${a}</option>`)}
                </select>
                <div class="flex gap-3 justify-end">
                  <button type="button" onclick="document.getElementById('link-db-modal').classList.add('hidden')"
                    class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <button type="submit"
                    class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">Link</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}
  `;
}

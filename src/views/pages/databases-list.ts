import { html } from "hono/html";
import { pageHeader } from "../components/nav.js";
import { table } from "../components/table.js";

export function databasesListPage(
  databases: Array<{ name: string; links: string[] }>,
  apps: string[],
  enableDestructiveActions = true,
) {
  const header = pageHeader(
    "Databases",
    enableDestructiveActions
      ? html`
          <button
            onclick="document.getElementById('create-db-modal').classList.remove('hidden')"
            class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
            Create Database
          </button>
        `
      : html`<span class="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">View only mode</span>`,
  );

  const rows = databases.map(
    (db) => html`
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-4 py-3">
          <a href="/databases/${db.name}" class="text-blue-600 hover:text-blue-800 font-medium">${db.name}</a>
        </td>
        <td class="px-4 py-3">
          ${db.links.length > 0
            ? db.links.map(
                (link) => html`<span class="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded mr-1">${link}</span>`,
              )
            : html`<span class="text-gray-400 text-xs">none</span>`}
        </td>
        <td class="px-4 py-3 text-right">
          <div class="flex gap-2 justify-end">
            ${enableDestructiveActions
              ? html`
                  <button onclick="openLinkModal('${db.name}')"
                    class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2.5 py-1 rounded transition-colors">Link</button>
                  <button onclick="document.getElementById('destroy-db-${db.name}').classList.remove('hidden')"
                    class="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded transition-colors">Destroy</button>
                `
              : html`<span class="text-xs text-gray-400">View only</span>`}
          </div>
        </td>
      </tr>
    `,
  );

  return html`
    ${header}

    ${databases.length === 0
      ? html`<div class="text-center py-12 text-gray-400">No databases found. Create one to get started.</div>`
      : table(
          [
            { header: "Name" },
            { header: "Linked Apps" },
            { header: "Actions", class: "text-right" },
          ],
          rows,
        )}

    ${enableDestructiveActions
      ? html`
          <!-- Create Database Modal -->
          <div id="create-db-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
              <h3 class="text-lg font-bold text-gray-900 mb-4">Create Database</h3>
              <form method="POST" action="/databases/create">
                <label class="block mb-2 text-sm font-medium text-gray-600">Database Name</label>
                <input type="text" name="name" required pattern="[a-z][a-z0-9-]*" minlength="2" maxlength="64"
                  class="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg mb-1 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-database">
                <p class="text-xs text-gray-400 mb-4">Lowercase letters, numbers, hyphens.</p>
                <div class="flex gap-3 justify-end">
                  <button type="button" onclick="document.getElementById('create-db-modal').classList.add('hidden')"
                    class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <button type="submit"
                    class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">Create</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}

    ${enableDestructiveActions
      ? html`
          <!-- Link Modal -->
          <div id="link-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
              <h3 class="text-lg font-bold text-gray-900 mb-4">Link Database to App</h3>
              <form method="POST" id="link-form">
                <label class="block mb-2 text-sm font-medium text-gray-600">App</label>
                <select name="app" required
                  class="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg mb-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  ${apps.map((a) => html`<option value="${a}">${a}</option>`)}
                </select>
                <div class="flex gap-3 justify-end">
                  <button type="button" onclick="document.getElementById('link-modal').classList.add('hidden')"
                    class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <button type="submit"
                    class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">Link</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}

    <!-- Destroy modals for each DB -->
    ${enableDestructiveActions
      ? databases.map(
          (db) => html`
            <div id="destroy-db-${db.name}" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
                <h3 class="text-lg font-bold text-red-600 mb-2">Destroy Database</h3>
                <p class="text-sm text-gray-600 mb-4">
                  Permanently destroy <strong class="text-gray-900">${db.name}</strong> and all its data?
                </p>
                <div class="flex gap-3 justify-end">
                  <button type="button" onclick="document.getElementById('destroy-db-${db.name}').classList.add('hidden')"
                    class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <form method="POST" action="/databases/${db.name}/destroy">
                    <button type="submit"
                      class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Destroy</button>
                  </form>
                </div>
              </div>
            </div>
          `,
        )
      : html``}

    ${enableDestructiveActions
      ? html`<script>
          function openLinkModal(dbName) {
            document.getElementById('link-form').action = '/databases/' + dbName + '/link';
            document.getElementById('link-modal').classList.remove('hidden');
          }
        </script>`
      : html``}
  `;
}

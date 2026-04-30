import { html } from "hono/html";
import { pageHeader } from "../components/nav.js";
import { readonlyChip } from "../components/action-btn.js";

export function databasesListPage(
  databases: Array<{ name: string; links: string[]; size: string }>,
  apps: string[],
  enableDestructiveActions = true,
  totalSize?: string,
) {
  const sub = html`${databases.length} service${databases.length === 1 ? "" : "s"} provisioned${totalSize ? html` · ${totalSize} total` : html``}`;

  const headerActions = enableDestructiveActions
    ? html`
        <button
          onclick="document.getElementById('create-db-modal').classList.remove('hidden')"
          class="dk-btn dk-btn-primary">
          Create Database
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
          <span><span class="dk-ro-banner-strong">Read‑only session.</span> Link / Destroy actions are disabled in this view.</span>
        </div>
      `;

  const rowActions = (dbName: string) =>
    enableDestructiveActions
      ? html`
          <div class="dk-action-row">
            <button onclick="openLinkModal('${dbName}')" class="dk-actbtn dk-actbtn-accent">Link</button>
            <button onclick="document.getElementById('destroy-db-${dbName}').classList.remove('hidden')" class="dk-actbtn dk-actbtn-bad">Destroy</button>
          </div>
        `
      : html`
          <div class="dk-action-row">
            ${readonlyChip("Link",    "accent")}
            ${readonlyChip("Destroy", "bad")}
          </div>
        `;

  return html`
    ${pageHeader("Databases", headerActions, sub)}
    ${banner}

    ${databases.length === 0
      ? html`<div class="dk-card"><div class="dk-empty">No databases found. Create one to get started.</div></div>`
      : html`
          <div class="dk-card" style="padding:0;overflow:hidden">
            <table class="dk-tbl">
              <thead>
                <tr>
                  <th style="width:30%">Name</th>
                  <th>Linked apps</th>
                  <th style="width:14%">Size</th>
                  <th class="al-r" style="width:18%">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${databases.map((db) => html`
                  <tr>
                    <td>
                      <a class="dk-app-name" href="/databases/${db.name}">${db.name}</a>
                      <div class="dk-app-domains">postgres</div>
                    </td>
                    <td>
                      ${db.links.length > 0
                        ? html`
                            <div class="dk-taglist">
                              ${db.links.map((l) => html`<a href="/apps/${l}" class="dk-tag" title="${l}">${l}</a>`)}
                            </div>
                          `
                        : html`<span style="color:var(--ink-4);font-size:12px;font-family:var(--font-mono)">—</span>`}
                    </td>
                    <td style="font-family:var(--font-mono);font-size:12px;color:var(--ink-2)">${db.size}</td>
                    <td style="text-align:right">${rowActions(db.name)}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `}

    ${enableDestructiveActions
      ? html`
          <div id="create-db-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
              <h3 style="font-weight:600;font-size:16px;margin-bottom:14px">Create Database</h3>
              <form method="POST" action="/databases/create">
                <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--ink-3)">Database Name</label>
                <input type="text" name="name" required pattern="[a-z][a-z0-9-]*" minlength="2" maxlength="64"
                  style="width:100%;padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:13px;outline:none;margin-bottom:6px"
                  placeholder="my-database">
                <p style="font-size:11px;color:var(--ink-4);margin-bottom:14px">Lowercase letters, numbers, hyphens.</p>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" onclick="document.getElementById('create-db-modal').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                  <button type="submit" class="dk-btn dk-btn-primary">Create</button>
                </div>
              </form>
            </div>
          </div>

          <div id="link-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
              <h3 style="font-weight:600;font-size:16px;margin-bottom:14px">Link Database to App</h3>
              <form method="POST" id="link-form">
                <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--ink-3)">App</label>
                <select name="app" required
                  style="width:100%;padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-size:13px;outline:none;margin-bottom:14px">
                  ${apps.map((a) => html`<option value="${a}">${a}</option>`)}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" onclick="document.getElementById('link-modal').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                  <button type="submit" class="dk-btn dk-btn-primary">Link</button>
                </div>
              </form>
            </div>
          </div>

          ${databases.map((db) => html`
            <div id="destroy-db-${db.name}" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
                <h3 style="font-weight:600;font-size:16px;color:var(--bad);margin-bottom:8px">Destroy Database</h3>
                <p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">
                  Permanently destroy <strong style="color:var(--ink)">${db.name}</strong> and all its data?
                </p>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" onclick="document.getElementById('destroy-db-${db.name}').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                  <form method="POST" action="/databases/${db.name}/destroy">
                    <button type="submit" class="dk-actbtn dk-actbtn-bad" style="padding:7px 13px">Destroy</button>
                  </form>
                </div>
              </div>
            </div>
          `)}

          <script>
            function openLinkModal(dbName) {
              document.getElementById('link-form').action = '/databases/' + dbName + '/link';
              document.getElementById('link-modal').classList.remove('hidden');
            }
          </script>
        `
      : html``}
  `;
}

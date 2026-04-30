import { html, raw } from "hono/html";
import { readonlyChip } from "../components/action-btn.js";

const KEY_FIELDS = new Set(["Status", "Version", "Dsn", "Exposed ports", "Links"]);

export function databaseDetailPage(
  name: string,
  info: string,
  links: string[],
  apps: string[],
  showExplorer = false,
  enableDestructiveActions = true,
) {
  const lines = info.trim().split("\n");
  const pairs: Array<[string, string]> = [];
  for (const line of lines) {
    if (line.startsWith("====")) continue;
    const match = line.match(/^\s*(.+?):\s+(.*)$/);
    if (match) pairs.push([match[1].trim(), match[2].trim()]);
  }

  const keyPairs = pairs.filter(([key]) => KEY_FIELDS.has(key));
  const otherPairs = pairs.filter(([key]) => !KEY_FIELDS.has(key));
  const dsn = pairs.find(([key]) => key === "Dsn")?.[1] || "";
  const status = pairs.find(([key]) => key === "Status")?.[1] || "unknown";
  const version = pairs.find(([key]) => key === "Version")?.[1] || "";

  const statusLower = status.toLowerCase();
  const statusCls =
    statusLower === "running"
      ? "dk-pill-ok"
      : statusLower === "stopped" || statusLower === "exited"
        ? "dk-pill-warn"
        : statusLower === "failed"
          ? "dk-pill-bad"
          : "dk-pill-muted";

  return html`
    <a href="/databases" class="dk-detail-back">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Databases
    </a>

    <div class="dk-detail-head">
      <div>
        <div class="dk-detail-title-row">
          <div class="dk-detail-title">${name}</div>
          <span class="dk-pill ${statusCls}">
            ${statusLower === "running" ? html`<span class="dk-pill-dot"></span>` : ""}${status}
          </span>
        </div>
        <div class="dk-detail-meta">
          ${version || "postgres"} · ${links.length} linked app${links.length === 1 ? "" : "s"}
        </div>
      </div>
      <div class="dk-action-row">
        ${showExplorer
          ? html`<a href="/databases/${name}/explore" class="dk-actbtn dk-actbtn-accent" style="text-decoration:none">Explore</a>`
          : readonlyChip("Explore", "accent")}
        ${readonlyChip("Backup", "neutral")}
      </div>
    </div>

    <section class="dk-card">
      <header class="dk-card-h"><div class="dk-card-title">Database Info</div></header>
      <div class="dk-card-b">
        ${dsn
          ? html`
              <div class="dk-dsn-row">
                <div class="dk-kv-k">DSN</div>
                <div class="dk-dsn-val" title="${dsn}">${dsn}</div>
                <button class="dk-copychip" data-copy="${dsn}" onclick="(function(b){var v=b.getAttribute('data-copy');navigator.clipboard.writeText(v);var o=b.innerText;b.innerText='Copied';setTimeout(function(){b.innerText=o},1200)})(this)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                  </svg>
                  Copy
                </button>
              </div>
            `
          : html``}
        ${keyPairs
          .filter(([key]) => key !== "Dsn" && key !== "Links")
          .map(([key, val]) => html`
            <div class="dk-kv">
              <div class="dk-kv-k">${key}</div>
              <div class="dk-kv-v">${val || "—"}</div>
              <div></div>
            </div>
          `)}
        <div class="dk-kv">
          <div class="dk-kv-k">Links</div>
          <div class="dk-kv-v">
            ${links.length > 0
              ? html`<div class="dk-taglist">${links.map((l) => html`<a href="/apps/${l}" class="dk-tag">${l}</a>`)}</div>`
              : html`<span style="color:var(--ink-4)">none</span>`}
          </div>
          <div></div>
        </div>
      </div>
    </section>

    ${otherPairs.length > 0
      ? html`
          <details class="dk-raw">
            <summary>
              <span class="dk-raw-caret">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
              <span>Raw Report</span>
              <span class="dk-raw-meta">${otherPairs.length} lines</span>
            </summary>
            <div class="dk-raw-list">
              ${otherPairs.map(([key, val]) => html`
                <div class="dk-raw-kv">
                  <span class="dk-raw-kv-k">${key}</span>
                  <span class="dk-raw-kv-v">${val || "—"}</span>
                </div>
              `)}
            </div>
          </details>
        `
      : html``}

    <section class="dk-card">
      <header class="dk-card-h">
        <div class="dk-card-title">Linked apps</div>
        <div class="dk-card-action">
          ${enableDestructiveActions
            ? html`<button onclick="document.getElementById('link-db-modal').classList.remove('hidden')" class="dk-actbtn dk-actbtn-accent">Link app</button>`
            : readonlyChip("Link app", "accent")}
        </div>
      </header>
      ${links.length === 0
        ? html`<div class="dk-empty">No linked apps</div>`
        : html`
            <div>
              ${links.map((link) => html`
                <div class="dk-linkrow">
                  <div>
                    <a href="/apps/${link}" class="dk-app-name">${link}</a>
                  </div>
                  ${enableDestructiveActions
                    ? html`<form method="POST" action="/databases/${name}/unlink" style="display:inline">
                        <input type="hidden" name="app" value="${link}">
                        <button type="submit" class="dk-actbtn dk-actbtn-bad">Unlink</button>
                      </form>`
                    : readonlyChip("Unlink", "bad")}
                </div>
              `)}
            </div>
          `}
    </section>

    ${enableDestructiveActions
      ? html`
          <div id="link-db-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
              <h3 style="font-weight:600;font-size:16px;margin-bottom:14px">Link ${name} to App</h3>
              <form method="POST" action="/databases/${name}/link">
                <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--ink-3)">App</label>
                <select name="app" required
                  style="width:100%;padding:8px 10px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-size:13px;outline:none;margin-bottom:14px">
                  ${apps.map((a) => html`<option value="${a}">${a}</option>`)}
                </select>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" onclick="document.getElementById('link-db-modal').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                  <button type="submit" class="dk-btn dk-btn-primary">Link</button>
                </div>
              </form>
            </div>
          </div>
        `
      : html``}
    ${raw("")}
  `;
}

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { AppInfo, AppMeta } from "../../lib/dokku.js";
import { tabs } from "../components/nav.js";
import { statusBadge } from "../components/badge.js";
import { actionBtn, readonlyChip } from "../components/action-btn.js";

const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const REV_PATTERN = /^[0-9a-f]+$/;

function headerActions(appName: string, appInfo?: AppInfo, enableDestructive = true) {
  if (!enableDestructive) {
    return html`
      <div class="dk-action-row">
        ${readonlyChip("Restart", "warn")}
        ${readonlyChip("Stop",    "neutral")}
        ${readonlyChip("Rebuild", "accent")}
        ${readonlyChip("Destroy", "bad")}
      </div>
    `;
  }
  const status = appInfo?.status ?? "unknown";
  return html`
    <div class="dk-action-row">
      ${status === "running"
        ? html`
            ${actionBtn(appName, "restart", "Restart", "", "sm", `Restart ${appName}?`)}
            ${actionBtn(appName, "stop",    "Stop",    "", "sm", `Stop ${appName}?`)}
            ${actionBtn(appName, "rebuild", "Rebuild", "", "sm", `Rebuild ${appName}? This may take a few minutes.`)}
          `
        : status === "stopped"
          ? html`
              ${actionBtn(appName, "start",   "Start",   "", "sm")}
              ${actionBtn(appName, "rebuild", "Rebuild", "", "sm", `Rebuild ${appName}? This may take a few minutes.`)}
            `
          : html``}
      <button onclick="document.getElementById('destroy-modal').classList.remove('hidden')"
        class="dk-actbtn dk-actbtn-bad">Destroy</button>
    </div>
  `;
}

export function appDetailPage(
  appName: string,
  activeTab: string,
  tabContent: HtmlEscapedString | Promise<HtmlEscapedString>,
  appInfo?: AppInfo,
  enableDestructiveActions = true,
) {
  const status = appInfo?.status ?? "unknown";
  return html`
    <a href="/apps" class="dk-detail-back">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Apps
    </a>

    <div class="dk-detail-head">
      <div>
        <div class="dk-detail-title-row">
          <div class="dk-detail-title">${appName}</div>
          ${appInfo ? statusBadge(status) : html``}
        </div>
        ${appInfo ? html`
          <div class="dk-detail-meta">
            ${appInfo.appType ? `${appInfo.appType.toLowerCase()}` : "untyped"}
            ${appInfo.processCount ? html` · ${appInfo.processCount} ${appInfo.processCount === 1 ? "process" : "processes"}` : html``}
            ${appInfo.domains.length ? html` · ${appInfo.domains[0]}` : html``}
          </div>
        ` : html``}
      </div>
      ${headerActions(appName, appInfo, enableDestructiveActions)}
    </div>

    ${tabs(appName, activeTab)}

    <div id="tab-content">
      ${tabContent}
    </div>

    ${enableDestructiveActions
      ? html`
          <div id="destroy-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="dk-modal w-full max-w-md p-6" style="box-shadow:0 20px 50px oklch(0 0 0 / 0.18)">
              <h3 style="font-weight:600;font-size:16px;color:var(--bad);margin-bottom:8px">Destroy App</h3>
              <p style="font-size:13px;color:var(--ink-2);margin-bottom:14px">
                This will permanently destroy <strong style="color:var(--ink)">${appName}</strong> and all its data. This cannot be undone.
              </p>
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button type="button" onclick="document.getElementById('destroy-modal').classList.add('hidden')" class="dk-btn dk-btn-ghost">Cancel</button>
                <form method="POST" action="/apps/${appName}/destroy">
                  <button type="submit" class="dk-actbtn dk-actbtn-bad" style="padding:7px 13px">Destroy</button>
                </form>
              </div>
            </div>
          </div>
        `
      : html``}
  `;
}

function processStatusDot(status: string) {
  const lower = status.toLowerCase();
  const cls = lower === "running"
    ? ""
    : (lower === "stopped" || lower === "exited")
      ? "is-bad"
      : "is-warn";
  return html`<span class="dk-proc-status ${cls}">
    <span class="dot"></span>
    <span style="font-family:var(--font-mono);font-size:12px">${status}</span>
  </span>`;
}

export function appInfoPartial(appName: string, meta: AppMeta) {
  const { psReport, gitReport, gitRev, appType, githubRepo, processes } = meta;

  const isRunning = psReport["Running"]?.toLowerCase() === "true";
  const isDeployed = psReport["Deployed"]?.toLowerCase() === "true";
  const restore = psReport["Restore"] || "—";
  const statusText = isRunning ? "Running" : isDeployed ? "Stopped" : "Not deployed";
  const shortRev = gitRev ? gitRev.slice(0, 7) : "";

  const safeCommitUrl = (REPO_PATTERN.test(githubRepo) && REV_PATTERN.test(gitRev))
    ? `https://github.com/${githubRepo}/commit/${gitRev}`
    : "";

  const deployBranch = gitReport?.deployBranch || "";
  const lastUpdated = gitReport?.lastUpdatedAt || "";

  return html`
    <div class="dk-stats">
      <div class="dk-stat">
        <div class="dk-stat-label">Status</div>
        <div class="dk-stat-value">${statusText}</div>
        <div class="dk-stat-meta">${processes.length} ${processes.length === 1 ? "process" : "processes"}</div>
      </div>
      <div class="dk-stat">
        <div class="dk-stat-label">Git Rev</div>
        <div class="dk-stat-value mono" style="font-size:16px">${shortRev || "—"}</div>
        <div class="dk-stat-meta">
          ${safeCommitUrl
            ? html`<a href="${safeCommitUrl}" target="_blank" rel="noopener">view commit ↗</a>`
            : "—"}
        </div>
      </div>
      <div class="dk-stat">
        <div class="dk-stat-label">Auto‑Restart</div>
        <div class="dk-stat-value">${restore === "true" ? "Enabled" : "Disabled"}</div>
        <div class="dk-stat-meta">${psReport["Restore"] || "—"}</div>
      </div>
    </div>

    <section class="dk-card">
      <header class="dk-card-h"><div class="dk-card-title">Deploy Info</div></header>
      <div class="dk-card-b">
        <div class="dk-kv">
          <div class="dk-kv-k">App type</div>
          <div class="dk-kv-v">${appType || "—"}</div>
          <div></div>
        </div>
        ${deployBranch ? html`
          <div class="dk-kv">
            <div class="dk-kv-k">Branch</div>
            <div class="dk-kv-v">${deployBranch}</div>
            <div></div>
          </div>` : html``}
        ${shortRev ? html`
          <div class="dk-kv">
            <div class="dk-kv-k">Commit</div>
            <div class="dk-kv-v">${shortRev}</div>
            <div></div>
          </div>` : html``}
        ${lastUpdated ? html`
          <div class="dk-kv">
            <div class="dk-kv-k">Last deployed</div>
            <div class="dk-kv-v">${lastUpdated}</div>
            <div></div>
          </div>` : html``}
      </div>
    </section>

    ${processes.length > 0 ? html`
      <section class="dk-card">
        <header class="dk-card-h">
          <div class="dk-card-title">Processes</div>
          <div class="dk-card-meta">${processes.length} container${processes.length === 1 ? "" : "s"}</div>
        </header>
        <table class="dk-proc-tbl">
          <thead>
            <tr>
              <th>Container</th>
              <th>Type</th>
              <th class="al-r">Status</th>
            </tr>
          </thead>
          <tbody>
            ${processes.map((p) => html`
              <tr>
                <td class="mono">${p.name}</td>
                <td class="mono">${p.type}</td>
                <td class="al-r">${processStatusDot(p.status)}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </section>
    ` : html``}

    <details class="dk-raw">
      <summary>
        <span class="dk-raw-caret">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span>Raw Report</span>
        <span class="dk-raw-meta">${Object.keys(psReport).length} lines</span>
      </summary>
      <div class="dk-raw-list">
        ${Object.entries(psReport).map(([key, val]) => html`
          <div class="dk-raw-kv">
            <span class="dk-raw-kv-k">${key}</span>
            <span class="dk-raw-kv-v">${val || "—"}</span>
          </div>
        `)}
      </div>
    </details>
  `;
}

export function appLogsPartial(appName: string) {
  return html`
    <section class="dk-card">
      <header class="dk-card-h">
        <div class="dk-card-title">Logs</div>
        <div class="dk-card-action">
          <button id="log-pause-btn" class="dk-btn dk-btn-ghost">Pause</button>
          <button id="log-clear-btn" class="dk-btn dk-btn-ghost">Clear</button>
        </div>
      </header>

      <div class="dk-logs-toolbar">
        <span class="dk-live-dot" id="log-live-dot"></span>
        <span id="sse-status" style="font-size:12px;color:var(--ink-3);font-family:var(--font-mono)">connecting…</span>
        <div class="dk-logs-search" style="margin-left:auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input id="log-filter" placeholder="Filter logs…">
        </div>
        <label style="font-size:11px;color:var(--ink-3);display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono)">
          <input type="checkbox" id="log-autoscroll" checked> auto-scroll
        </label>
      </div>

      <div id="log-container" class="dk-logs">
        <div style="color:oklch(0.55 0.01 80)"># connecting to log stream…</div>
      </div>
    </section>
    ${raw(`<script>
      (function() {
        var container = document.getElementById('log-container');
        var status = document.getElementById('sse-status');
        var liveDot = document.getElementById('log-live-dot');
        var pauseBtn = document.getElementById('log-pause-btn');
        var clearBtn = document.getElementById('log-clear-btn');
        var filterEl = document.getElementById('log-filter');
        var autoScrollChk = document.getElementById('log-autoscroll');
        if (!container) return;
        var appName = ${JSON.stringify(appName)};
        var es = new EventSource('/apps/' + encodeURIComponent(appName) + '/logs/stream');
        var MAX_LINES = 2000;
        var FLUSH_INTERVAL = 100;
        var first = true;
        var paused = false;
        var buffer = [];
        var pendingLines = [];
        var flushScheduled = false;
        var filter = '';

        function classForLine(text) {
          if (/\\bERROR\\b|\\berror\\b|\\bFATAL\\b|\\bfatal\\b|\\bpanic\\b/.test(text)) return 'log-err';
          if (/\\bWARN\\b|\\bwarn\\b|\\bwarning\\b/.test(text)) return 'log-warn';
          if (/\\bDEBUG\\b|\\bdebug\\b/.test(text)) return 'log-debug';
          return '';
        }

        function shouldShow(text) { return !filter || text.toLowerCase().indexOf(filter) !== -1; }

        function flushPending() {
          flushScheduled = false;
          if (pendingLines.length === 0) return;
          if (first) { container.innerHTML = ''; first = false; }
          var frag = document.createDocumentFragment();
          for (var i = 0; i < pendingLines.length; i++) {
            var line = document.createElement('div');
            line.className = classForLine(pendingLines[i]);
            line.style.whiteSpace = 'pre-wrap';
            line.textContent = pendingLines[i];
            if (!shouldShow(pendingLines[i])) line.style.display = 'none';
            frag.appendChild(line);
          }
          container.appendChild(frag);
          pendingLines = [];
          while (container.childNodes.length > MAX_LINES) container.removeChild(container.firstChild);
          if (autoScrollChk && autoScrollChk.checked) container.scrollTop = container.scrollHeight;
        }

        function appendLine(text) {
          pendingLines.push(text);
          if (!flushScheduled) {
            flushScheduled = true;
            setTimeout(flushPending, FLUSH_INTERVAL);
          }
        }

        es.addEventListener('log', function(e) {
          if (paused) { buffer.push(e.data); return; }
          appendLine(e.data);
        });
        es.onopen = function() {
          if (status) status.textContent = 'streaming';
          if (liveDot) liveDot.style.opacity = '1';
        };
        es.onerror = function() {
          if (status) status.textContent = 'reconnecting…';
          if (liveDot) liveDot.style.opacity = '0.3';
        };

        if (pauseBtn) pauseBtn.onclick = function() {
          paused = !paused;
          pauseBtn.textContent = paused ? 'Resume' : 'Pause';
          if (status) status.textContent = paused ? 'paused' : 'streaming';
          if (liveDot) liveDot.style.opacity = paused ? '0.3' : '1';
          if (!paused && buffer.length > 0) { buffer.forEach(appendLine); buffer = []; }
        };

        if (clearBtn) clearBtn.onclick = function() { container.innerHTML = ''; first = false; };

        if (filterEl) filterEl.oninput = function() {
          filter = (filterEl.value || '').toLowerCase();
          var nodes = container.children;
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].style.display = shouldShow(nodes[i].textContent) ? '' : 'none';
          }
        };
      })();
    </script>`)}
  `;
}

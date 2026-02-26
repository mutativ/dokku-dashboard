import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { AppInfo, AppMeta } from "../../lib/dokku.js";
import { tabs } from "../components/nav.js";
import { statusBadge } from "../components/badge.js";
import { actionBtn } from "../components/action-btn.js";

function headerActions(appName: string, appInfo?: AppInfo, enableDestructiveActions = true) {
  if (!enableDestructiveActions) {
    return html`<span class="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">View only mode</span>`;
  }
  const status = appInfo?.status ?? "unknown";

  return html`
    <div class="flex items-center gap-2">
      ${status === "running"
        ? html`
            ${actionBtn(appName, "restart", "Restart", "bg-amber-100 hover:bg-amber-200 text-amber-700", "md", `Restart ${appName}?`)}
            ${actionBtn(appName, "stop", "Stop", "bg-gray-200 hover:bg-gray-300 text-gray-600", "md", `Stop ${appName}?`)}
            ${actionBtn(appName, "rebuild", "Rebuild", "bg-purple-100 hover:bg-purple-200 text-purple-700", "md", `Rebuild ${appName}? This may take a few minutes.`)}
          `
        : status === "stopped"
          ? html`
              ${actionBtn(appName, "start", "Start", "bg-green-100 hover:bg-green-200 text-green-700", "md")}
              ${actionBtn(appName, "rebuild", "Rebuild", "bg-purple-100 hover:bg-purple-200 text-purple-700", "md", `Rebuild ${appName}? This may take a few minutes.`)}
            `
          : html``}
      <button onclick="document.getElementById('destroy-modal').classList.remove('hidden')"
        class="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition-colors">Destroy</button>
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
  return html`
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="text-2xl font-bold text-gray-900">${appName}</h2>
        ${appInfo ? statusBadge(appInfo.status) : html``}
      </div>
      ${headerActions(appName, appInfo, enableDestructiveActions)}
    </div>

    ${tabs(appName, activeTab)}

    <div id="tab-content">
      ${tabContent}
    </div>

    ${enableDestructiveActions
      ? html`
          <!-- Destroy confirmation -->
          <div id="destroy-modal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div class="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-xl">
              <h3 class="text-lg font-bold text-red-600 mb-2">Destroy App</h3>
              <p class="text-sm text-gray-600 mb-4">
                This will permanently destroy <strong class="text-gray-900">${appName}</strong> and all its data.
                This action cannot be undone.
              </p>
              <div class="flex gap-3 justify-end">
                <button type="button" onclick="document.getElementById('destroy-modal').classList.add('hidden')"
                  class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                <form method="POST" action="/apps/${appName}/destroy">
                  <button type="submit"
                    class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    Destroy
                  </button>
                </form>
              </div>
            </div>
          </div>
        `
      : html``}
  `;
}

// ── Stat card helper ──────────────────────────────────────────────────

function statCard(
  label: string,
  value: string,
  sub?: HtmlEscapedString | Promise<HtmlEscapedString> | string,
) {
  return html`
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">${label}</p>
      <p class="text-lg font-semibold text-gray-900">${value || "\u2014"}</p>
      ${sub ? html`<p class="text-xs text-gray-400 mt-0.5">${sub}</p>` : html``}
    </div>
  `;
}

function processStatusBadge(status: string) {
  const lower = status.toLowerCase();
  const color = lower === "running" ? "bg-green-500"
    : (lower === "stopped" || lower === "exited") ? "bg-red-500"
    : "bg-gray-400";
  return html`<span class="inline-block w-2 h-2 rounded-full ${color} mr-1.5"></span>`;
}

// Validate repo format to prevent XSS in constructed URLs
const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const REV_PATTERN = /^[0-9a-f]+$/;

export function appInfoPartial(appName: string, meta: AppMeta) {
  const { psReport, gitReport, gitRev, appType, githubRepo, processes } = meta;

  const isRunning = psReport["Running"]?.toLowerCase() === "true";
  const isDeployed = psReport["Deployed"]?.toLowerCase() === "true";
  const restore = psReport["Restore"] || "\u2014";
  const statusText = isRunning ? "Running" : isDeployed ? "Stopped" : "Not deployed";

  // Build commit URL only if repo and rev match safe patterns
  const shortRev = gitRev ? gitRev.slice(0, 7) : "";
  const safeCommitUrl = (REPO_PATTERN.test(githubRepo) && REV_PATTERN.test(gitRev))
    ? `https://github.com/${githubRepo}/commit/${gitRev}`
    : "";

  // Deploy branch and time from git:report
  const deployBranch = gitReport?.deployBranch || "\u2014";
  const lastUpdated = gitReport?.lastUpdatedAt || "";

  const commitLink = safeCommitUrl
    ? html`<a href="${safeCommitUrl}" target="_blank" rel="noopener" class="text-blue-500 hover:text-blue-700">View commit &rarr;</a>`
    : undefined;

  return html`
    <!-- Overview grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${statCard("Status", statusText)}
      ${statCard("Containers", String(processes.length), processes.length > 0 ? processes.map((p) => p.type).filter((v, i, a) => a.indexOf(v) === i).join(", ") : undefined)}
      ${statCard("Git Rev", shortRev || "\u2014", commitLink)}
      ${statCard("Restore Policy", restore)}
    </div>

    <!-- Deploy info -->
    ${isDeployed
      ? html`
          <div class="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 class="text-sm font-semibold text-gray-700">Deploy Info</h3>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100">
              <div class="bg-white p-4">
                <p class="text-xs text-gray-400 mb-1">Branch</p>
                <p class="text-sm font-medium text-gray-900 font-mono">${deployBranch}</p>
              </div>
              <div class="bg-white p-4">
                <p class="text-xs text-gray-400 mb-1">App Type</p>
                <p class="text-sm font-medium text-gray-900">${appType || "\u2014"}</p>
              </div>
              <div class="bg-white p-4">
                <p class="text-xs text-gray-400 mb-1">Last Deployed</p>
                <p class="text-sm font-medium text-gray-900">${lastUpdated || "\u2014"}</p>
              </div>
              <div class="bg-white p-4">
                <p class="text-xs text-gray-400 mb-1">Commit</p>
                ${safeCommitUrl
                  ? html`<a href="${safeCommitUrl}" target="_blank" rel="noopener" class="text-sm font-medium text-blue-600 hover:text-blue-800 font-mono">${shortRev}</a>`
                  : html`<p class="text-sm font-medium text-gray-900 font-mono">${shortRev || "\u2014"}</p>`}
              </div>
            </div>
          </div>
        `
      : html``}

    <!-- Process list -->
    ${processes.length > 0
      ? html`
          <div class="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 class="text-sm font-semibold text-gray-700">Processes</h3>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 bg-gray-50/50">
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Container</th>
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${processes.map(
                  (p) => html`
                    <tr>
                      <td class="px-4 py-2.5 font-mono text-xs text-gray-700">${p.name}</td>
                      <td class="px-4 py-2.5 text-gray-600">${p.type}</td>
                      <td class="px-4 py-2.5">
                        <span class="inline-flex items-center text-xs">
                          ${processStatusBadge(p.status)}
                          ${p.status}
                        </span>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `
      : html``}

    <!-- Raw report (collapsible) -->
    <details class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <summary class="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none">
        Raw Report
      </summary>
      <div class="divide-y divide-gray-100">
        ${Object.entries(psReport).map(
          ([key, val]) => html`
            <div class="flex px-4 py-2.5 text-sm">
              <span class="w-64 text-gray-400 shrink-0">${key}</span>
              <span class="text-gray-700 font-mono text-xs break-all">${val || "\u2014"}</span>
            </div>
          `,
        )}
      </div>
    </details>
  `;
}

export function appLogsPartial(appName: string) {
  return html`
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-700">Live Logs</h3>
        <span id="sse-status" class="text-xs text-gray-400">Connecting...</span>
      </div>
      <div id="log-container"
           class="p-4 font-mono text-xs leading-relaxed h-[500px] overflow-y-auto bg-gray-900">
        <div class="text-gray-500">Connecting to log stream...</div>
      </div>
    </div>
    ${raw(`<script>
      (function() {
        var container = document.getElementById('log-container');
        var status = document.getElementById('sse-status');
        if (!container) return;
        var appName = ${JSON.stringify(appName)};
        var es = new EventSource('/apps/' + encodeURIComponent(appName) + '/logs/stream');
        var first = true;

        es.addEventListener('log', function(e) {
          if (first) {
            container.innerHTML = '';
            first = false;
          }
          var line = document.createElement('div');
          line.className = 'text-gray-300 whitespace-pre-wrap';
          line.textContent = e.data;
          container.appendChild(line);
          container.scrollTop = container.scrollHeight;
        });

        es.onopen = function() {
          if (status) status.textContent = 'Streaming via SSE';
          if (status) status.className = 'text-xs text-green-600';
        };

        es.onerror = function() {
          if (status) status.textContent = 'Disconnected \\u2014 retrying...';
          if (status) status.className = 'text-xs text-amber-600';
        };
      })();
    </script>`)}
  `;
}

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

const APP_VERSION = process.env.APP_VERSION ?? "dev";
const SERVER_HOST = process.env.DOKKU_SSH_HOST ?? "localhost";

const navItems: Array<{
  href: string;
  label: string;
  countKey: string;
  iconPaths: string[];
}> = [
  {
    href: "/apps",
    label: "Apps",
    countKey: "apps",
    iconPaths: [
      "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z",
      "M4 7.5l8 4.5 8-4.5",
      "M12 12v9",
    ],
  },
  {
    href: "/databases",
    label: "Databases",
    countKey: "databases",
    iconPaths: [],
  },
];

function dbIcon() {
  return html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
    <path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
    <path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
  </svg>`;
}

function appsIcon() {
  return html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </svg>`;
}

function brandGlyph() {
  return html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 7l8 4 8-4-8-4-8 4z" />
    <path d="M4 12l8 4 8-4" />
    <path d="M4 17l8 4 8-4" />
  </svg>`;
}

function navLink(item: typeof navItems[number], activePath?: string) {
  const isActive = activePath?.startsWith(item.href) ?? false;
  return html`<a href="${item.href}"
       class="dk-nav-link ${isActive ? "is-active" : ""}">
    <span class="ic">${item.countKey === "apps" ? appsIcon() : dbIcon()}</span>
    <span>${item.label}</span>
    <span id="nav-count-${item.countKey}" class="dk-nav-count" style="display:none"></span>
  </a>`;
}

export function layout(
  title: string,
  content: HtmlEscapedString | Promise<HtmlEscapedString>,
  activePath?: string,
  userEmail?: string,
) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — VPS Console</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32.png">
  <link rel="apple-touch-icon" href="/public/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/public/styles.css?v=3">
  <script src="/public/htmx.min.js"></script>
  <script>
    document.addEventListener('htmx:configRequest', function(e) {
      var m = document.cookie.match(/csrf_tok=([^;]+)/);
      if (m) e.detail.headers['X-CSRF-Token'] = m[1];
    });
  </script>
</head>
<body>
  <div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2"></div>

  <div class="dk-shell">
    <aside class="dk-side">
      <div class="dk-side-brand">
        <div class="dk-brand-mark">${brandGlyph()}</div>
        <div>
          <div class="dk-brand-name">VPS Console</div>
          <div class="dk-brand-sub">dokku · ${APP_VERSION}</div>
        </div>
      </div>

      <nav class="dk-side-nav">
        ${navItems.map((item) => navLink(item, activePath))}
      </nav>

      <div class="dk-server-card">
        <div class="dk-server-row">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="7" rx="2" />
            <rect x="3" y="13" width="18" height="7" rx="2" />
            <circle cx="7" cy="7.5" r="0.6" fill="currentColor" />
            <circle cx="7" cy="16.5" r="0.6" fill="currentColor" />
          </svg>
          <span class="dk-server-host">${SERVER_HOST}</span>
        </div>
        <div class="dk-server-region" style="margin-top:2px;padding-left:22px">
          dokku host
        </div>
        <div class="dk-server-stat">
          <div class="dk-server-stat-row" id="srv-stats" style="display:none">
            <span>apps</span>
            <span class="dk-bar"><span class="dk-bar-fill dk-bar-accent" id="srv-apps-bar" style="width:0%"></span></span>
            <span id="srv-apps-count">0</span>
          </div>
          <div class="dk-server-stat-row" id="srv-dbs" style="display:none">
            <span>dbs</span>
            <span class="dk-bar"><span class="dk-bar-fill dk-bar-ok" id="srv-dbs-bar" style="width:0%"></span></span>
            <span id="srv-dbs-count">0</span>
          </div>
        </div>
      </div>

      <div class="dk-side-foot">
        ${userEmail
          ? html`<div class="dk-side-meta" style="margin-bottom:8px">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${userEmail}</span>
            </div>`
          : html``}
        <a href="/logout" class="dk-nav-link">
          <span class="ic">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H10" />
            </svg>
          </span>
          <span>Sign out</span>
        </a>
        <div class="dk-side-meta">
          <span>${userEmail ?? ""}</span>
          <span>${APP_VERSION}</span>
        </div>
      </div>
    </aside>

    <main class="dk-main">
      <div class="dk-topbar"></div>
      <div class="dk-page">
        ${content}
      </div>
    </main>
  </div>

  <script>
    fetch('/api/counts').then(function(r){return r.json()}).then(function(d){
      Object.keys(d).forEach(function(k){
        var el=document.getElementById('nav-count-'+k);
        if(el){el.textContent=d[k];el.style.display='inline-block'}
      });
      var aps=document.getElementById('srv-apps-count');
      var dbs=document.getElementById('srv-dbs-count');
      var apsRow=document.getElementById('srv-stats');
      var dbsRow=document.getElementById('srv-dbs');
      var apsBar=document.getElementById('srv-apps-bar');
      var dbsBar=document.getElementById('srv-dbs-bar');
      if(aps){aps.textContent=d.apps;}
      if(dbs){dbs.textContent=d.databases;}
      if(apsRow){apsRow.style.display='grid';}
      if(dbsRow){dbsRow.style.display='grid';}
      if(apsBar){apsBar.style.width=Math.min(100,d.apps*8)+'%';}
      if(dbsBar){dbsBar.style.width=Math.min(100,d.databases*15)+'%';}
    }).catch(function(){});
  </script>

  <div id="reconnect-overlay" class="hidden fixed inset-0 bg-white/90 backdrop-blur-sm z-[100] flex items-center justify-center">
    <div class="text-center">
      <div class="spinner mx-auto mb-4" style="width:32px;height:32px;border-width:3px;"></div>
      <p class="text-lg font-semibold text-gray-900 mb-1">Dashboard is restarting</p>
      <p id="reconnect-status" class="text-sm text-gray-500">Waiting for dashboard to come back...</p>
    </div>
  </div>
  <script>
    document.body.addEventListener('htmx:afterRequest', function(e) {
      var xhr = e.detail.xhr;
      if (xhr && xhr.getResponseHeader('X-Self-Restart') === 'true') {
        var overlay = document.getElementById('reconnect-overlay');
        if (overlay) overlay.classList.remove('hidden');
        setTimeout(function() {
          var poll = setInterval(function() {
            fetch('/health').then(function(r) {
              if (r.ok) { clearInterval(poll); location.reload(); }
            }).catch(function() {});
          }, 2000);
        }, 5000);
      }
    });
  </script>
  ${raw("")}
</body>
</html>`;
}

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

const navItems = [
  { href: "/apps", label: "Apps", countKey: "apps", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { href: "/databases", label: "Databases", countKey: "databases", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" },
];

function userInitials(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const APP_VERSION = process.env.APP_VERSION ?? "dev";

export function layout(
  title: string,
  content: HtmlEscapedString | Promise<HtmlEscapedString>,
  activePath?: string,
  userEmail?: string,
) {
  const initials = userEmail ? userInitials(userEmail) : "";

  return html`<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Dokku Dashboard</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32.png">
  <link rel="apple-touch-icon" href="/public/apple-touch-icon.png">
  <link rel="stylesheet" href="/public/styles.css?v=2">
  <script src="/public/htmx.min.js"></script>
  <script>
    document.addEventListener('htmx:configRequest', function(e) {
      var m = document.cookie.match(/csrf_tok=([^;]+)/);
      if (m) e.detail.headers['X-CSRF-Token'] = m[1];
    });
  </script>
  <style>
    [hx-indicator] .htmx-indicator { display: none; }
    [hx-indicator].htmx-request .htmx-indicator { display: inline-block; }
    .htmx-request .htmx-indicator { display: inline-block; }
    .htmx-request.htmx-action-btn .btn-label { display: none; }
    .htmx-action-btn .btn-spinner { display: none; }
    .htmx-request.htmx-action-btn .btn-spinner { display: inline-block; }
    .spinner { border: 3px solid rgb(209 213 219); border-top-color: rgb(37 99 235); border-radius: 50%; width: 20px; height: 20px; animation: spin 0.8s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
    .toast-slide-in { animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in 3s forwards; }
  </style>
</head>
<body class="h-full bg-gray-50 text-gray-900">
  <div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2"></div>
  <div class="flex h-full">
    <!-- Sidebar -->
    <aside class="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div class="px-4 py-4 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <img src="/public/logo-192.png" alt="Dokku Dashboard" width="28" height="28" class="rounded-lg shrink-0">
          <span class="text-sm font-semibold text-gray-900 tracking-tight">Dokku Dashboard</span>
        </div>
      </div>

      <nav class="flex-1 px-3 py-4 space-y-1">
        ${raw(
          navItems
            .map(
              (item) => `
          <a href="${item.href}"
             class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
               activePath?.startsWith(item.href)
                 ? "bg-blue-50 text-blue-700"
                 : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
             }">
            <svg width="20" height="20" class="shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="${item.icon}"/>
            </svg>
            ${item.label}
            <span id="nav-count-${item.countKey}" class="ml-auto text-[10px] font-medium ${activePath?.startsWith(item.href) ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"} px-1.5 py-0.5 rounded-full hidden"></span>
          </a>`,
            )
            .join(""),
        )}
      </nav>

      <div class="px-3 py-4 border-t border-gray-200">
        ${userEmail
          ? html`
              <div class="flex items-center gap-3 px-2 mb-3">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">${initials}</div>
                <div class="min-w-0">
                  <p class="text-xs text-gray-600 truncate">${userEmail}</p>
                </div>
              </div>
            `
          : html``}
        <a href="/logout"
           class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <svg width="16" height="16" class="shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Sign out
        </a>
        <p class="mt-3 px-3 text-[10px] text-gray-400 font-mono">${APP_VERSION}</p>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-8 py-8">
        ${content}
      </div>
    </main>
  </div>

  <script>
    fetch('/api/counts').then(function(r){return r.json()}).then(function(d){
      Object.keys(d).forEach(function(k){
        var el=document.getElementById('nav-count-'+k);
        if(el){el.textContent=d[k];el.classList.remove('hidden')}
      });
    }).catch(function(){});
  </script>

  <!-- Self-restart reconnection overlay -->
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
</body>
</html>`;
}

import { html, raw } from "hono/html";

interface LoginPageOpts {
  showGoogle?: boolean;
  showPassword?: boolean;
  error?: string;
}

export function loginPage(opts: LoginPageOpts = {}) {
  const { showGoogle = false, showPassword = true, error } = opts;

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — VPS Console</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32.png">
  <link rel="apple-touch-icon" href="/public/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/public/styles.css?v=3">
</head>
<body style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px">
  <div style="width:100%;max-width:380px">
    <div class="dk-card" style="padding:32px;box-shadow:0 8px 24px oklch(0 0 0 / 0.06)">
      <div style="text-align:center;margin-bottom:28px">
        <div class="dk-brand-mark" style="width:48px;height:48px;border-radius:11px;margin:0 auto 14px;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7l8 4 8-4-8-4-8 4z" />
            <path d="M4 12l8 4 8-4" />
            <path d="M4 17l8 4 8-4" />
          </svg>
        </div>
        <h1 style="font-size:18px;font-weight:600;letter-spacing:-0.01em">VPS Console</h1>
        <p style="font-size:13px;color:var(--ink-3);margin-top:4px">Sign in to manage your apps</p>
      </div>

      ${error
        ? html`<div class="dk-pill dk-pill-bad" style="display:block;text-align:center;font-family:var(--font-ui);font-size:13px;padding:8px 12px;margin-bottom:18px">${error}</div>`
        : html``}

      ${showGoogle
        ? html`
            <a href="/auth/google" class="dk-btn" style="width:100%;justify-content:center;padding:11px 14px;font-weight:500">
              ${raw(googleIcon)}
              <span style="margin-left:6px">Sign in with Google</span>
            </a>
            ${showPassword
              ? html`
                  <div style="display:flex;align-items:center;gap:10px;margin:18px 0">
                    <div style="flex:1;height:1px;background:var(--line)"></div>
                    <span style="font-size:11px;color:var(--ink-4);font-family:var(--font-mono)">or</span>
                    <div style="flex:1;height:1px;background:var(--line)"></div>
                  </div>
                `
              : html``}
          `
        : html``}

      ${showPassword
        ? html`
            <form method="POST" action="/login">
              <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--ink-3)">Password</label>
              <input type="password" name="password" autofocus
                style="width:100%;padding:10px 12px;border:1px solid var(--line-2);border-radius:var(--radius-sm);font-size:14px;outline:none;margin-bottom:14px;color:var(--ink)"
                placeholder="Enter password">
              <button type="submit" class="dk-btn dk-btn-primary" style="width:100%;justify-content:center;padding:10px 14px;font-weight:600">
                Sign in
              </button>
            </form>
          `
        : html``}
    </div>
  </div>
</body>
</html>`;
}

const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

import { html, raw } from "hono/html";

interface LoginPageOpts {
  showGoogle?: boolean;
  showPassword?: boolean;
  error?: string;
}

export function loginPage(opts: LoginPageOpts = {}) {
  const { showGoogle = false, showPassword = true, error } = opts;

  return html`<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login - Dokku Dashboard</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32.png">
  <link rel="apple-touch-icon" href="/public/apple-touch-icon.png">
  <link rel="stylesheet" href="/public/styles.css?v=2">
</head>
<body class="h-full bg-gray-50 text-gray-900 flex items-center justify-center">
  <div class="w-full max-w-sm">
    <div class="bg-white border border-gray-200 rounded-2xl p-8 shadow-lg">
      <div class="text-center mb-8">
        <img src="/public/logo-192.png" alt="Dokku Dashboard" width="56" height="56" class="rounded-xl mx-auto mb-4">
        <h1 class="text-xl font-bold text-gray-900">Dokku Dashboard</h1>
        <p class="text-sm text-gray-500 mt-1">Sign in to manage your apps</p>
      </div>
      ${error
        ? html`<div class="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-5 text-sm">${error}</div>`
        : html``}

      ${showGoogle
        ? html`
            <a href="/auth/google"
              class="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium px-4 py-3 rounded-xl transition-colors border border-gray-300 shadow-sm">
              ${raw(googleIcon)}
              Sign in with Google
            </a>
            ${showPassword
              ? html`
                  <div class="flex items-center gap-3 my-5">
                    <div class="flex-1 h-px bg-gray-200"></div>
                    <span class="text-xs text-gray-400">or</span>
                    <div class="flex-1 h-px bg-gray-200"></div>
                  </div>
                `
              : html``}
          `
        : html``}

      ${showPassword
        ? html`
            <form method="POST" action="/login">
              <label class="block mb-2 text-sm font-medium text-gray-600">Password</label>
              <input type="password" name="password" autofocus
                class="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl mb-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password">
              <button type="submit"
                class="w-full bg-blue-600 hover:bg-blue-700 px-4 py-3 rounded-xl font-semibold transition-colors text-white">
                Sign In
              </button>
            </form>
          `
        : html``}
    </div>
  </div>
</body>
</html>`;
}

// Google "G" logo SVG (per Google branding guidelines)
const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

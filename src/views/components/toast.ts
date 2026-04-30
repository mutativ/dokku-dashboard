import { html, raw } from "hono/html";

const styles = {
  success: { bg: "var(--ok-bg)",  fg: "var(--ok)",  bd: "var(--ok-line)" },
  error:   { bg: "var(--bad-bg)", fg: "var(--bad)", bd: "var(--bad-line)" },
};

const icons = {
  success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`,
  error:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>`,
};

export function toastOob(type: "success" | "error", message: string) {
  const s = styles[type];
  return html`
    <div id="toast-container" hx-swap-oob="innerHTML" class="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <div class="toast-slide-in"
           role="alert"
           style="display:inline-flex;align-items:center;gap:8px;border:1px solid ${s.bd};background:${s.bg};color:${s.fg};border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;box-shadow:0 4px 14px oklch(0 0 0 / 0.08);font-family:var(--font-ui)">
        ${raw(icons[type])}
        <span>${message}</span>
      </div>
    </div>
  `;
}

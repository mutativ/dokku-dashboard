import { html, raw } from "hono/html";

const styles = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
};

const icons = {
  success: `<svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
  error: `<svg class="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
};

export function toastOob(type: "success" | "error", message: string) {
  return html`
    <div id="toast-container" hx-swap-oob="innerHTML" class="fixed top-4 right-4 z-50 flex flex-col gap-2">
      <div class="toast-slide-in flex items-center gap-2 border rounded-lg px-4 py-3 text-sm shadow-lg ${styles[type]}"
           role="alert">
        ${raw(icons[type])}
        <span>${message}</span>
      </div>
    </div>
  `;
}


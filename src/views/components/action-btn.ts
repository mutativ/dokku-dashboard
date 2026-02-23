import { html, raw } from "hono/html";

const sizes = {
  sm: { text: "text-xs", px: "px-2.5 py-1", spinner: "width:12px;height:12px;border-width:2px;" },
  md: { text: "text-sm", px: "px-3 py-1.5", spinner: "width:14px;height:14px;border-width:2px;" },
};

export function actionBtn(
  appName: string,
  action: string,
  label: string,
  cls: string,
  size: "sm" | "md" = "sm",
  confirm?: string,
) {
  const s = sizes[size];
  // Escape for safe attribute embedding, then use raw() since html`` would double-escape
  const safeConfirm = confirm?.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") ?? "";
  const confirmAttr = confirm ? raw(`hx-confirm="${safeConfirm}"`) : "";
  return html`
    <button hx-post="/apps/${appName}/${action}"
            hx-swap="none"
            ${confirmAttr}
            class="htmx-action-btn ${s.text} ${cls} ${s.px} rounded transition-colors inline-flex items-center gap-1">
      <span class="btn-label">${label}</span>
      <span class="btn-spinner spinner" style="${s.spinner}"></span>
    </button>
  `;
}

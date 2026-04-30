import { html, raw } from "hono/html";

export type ActionKind = "warn" | "neutral" | "bad" | "accent" | "ok";

const labelKindMap: Record<string, ActionKind> = {
  restart: "warn",
  stop:    "neutral",
  start:   "ok",
  rebuild: "accent",
  destroy: "bad",
  remove:  "bad",
  unlink:  "bad",
  link:    "accent",
  backup:  "neutral",
  explore: "accent",
};

function inferKind(action: string): ActionKind {
  return labelKindMap[action.toLowerCase()] ?? "neutral";
}

export function actionBtn(
  appName: string,
  action: string,
  label: string,
  _legacyCls?: string,
  _legacySize: "sm" | "md" = "sm",
  confirm?: string,
  kind?: ActionKind,
) {
  const k = kind ?? inferKind(action);
  const safeConfirm = confirm?.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") ?? "";
  const confirmAttr = confirm ? raw(`hx-confirm="${safeConfirm}"`) : "";
  return html`
    <button hx-post="/apps/${appName}/${action}"
            hx-swap="none"
            ${confirmAttr}
            class="htmx-action-btn dk-actbtn dk-actbtn-${k}">
      <span class="btn-label">${label}</span>
      <span class="btn-spinner spinner"></span>
    </button>
  `;
}

/** Read-only display action chip — looks alive, hovers a tooltip. */
export function readonlyChip(label: string, kind: ActionKind = "neutral") {
  return html`
    <span class="dk-actbtn dk-actbtn-${kind} dk-actbtn-ro" tabindex="0">
      <span>${label}</span>
      <span class="dk-actbtn-hint">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        read‑only
      </span>
    </span>
  `;
}

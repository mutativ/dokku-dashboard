import { html } from "hono/html";

export function alert(type: "success" | "error" | "info", message: string) {
  const cls = {
    success: "dk-pill-ok",
    error:   "dk-pill-bad",
    info:    "dk-pill-accent",
  }[type];

  return html`
    <div class="dk-card padded" style="margin-bottom:16px;border-color:var(--line)">
      <div class="dk-pill ${cls}" style="font-family:var(--font-ui);font-size:13px;padding:6px 12px">${message}</div>
    </div>
  `;
}

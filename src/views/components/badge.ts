import { html } from "hono/html";

const statusMap: Record<string, { label: string; cls: string; dot: boolean }> = {
  running:        { label: "running",      cls: "dk-pill dk-pill-ok",    dot: true  },
  stopped:        { label: "stopped",      cls: "dk-pill dk-pill-warn",  dot: false },
  deployed:       { label: "deployed",     cls: "dk-pill dk-pill-accent", dot: false },
  "not deployed": { label: "not deployed", cls: "dk-pill dk-pill-muted", dot: false },
  failed:         { label: "failed",       cls: "dk-pill dk-pill-bad",   dot: false },
  unknown:        { label: "unknown",      cls: "dk-pill dk-pill-muted", dot: false },
};

export function statusBadge(status: string) {
  const m = statusMap[status] ?? statusMap.unknown;
  return html`<span class="${m.cls}">${m.dot ? html`<span class="dk-pill-dot"></span>` : ""}${m.label}</span>`;
}

export function processBadge(type: string, count: number) {
  return html`<span class="dk-pill dk-pill-accent">${type} ×${String(count)}</span>`;
}

const typeStyles: Record<string, string> = {
  api:     "dk-pill dk-pill-accent",
  bot:     "dk-pill dk-pill-warn",
  indexer: "dk-pill dk-pill-ok",
};

export function typeBadge(type: string) {
  const cls = typeStyles[type] ?? "dk-pill dk-pill-muted";
  return html`<span class="${cls}">${type}</span>`;
}

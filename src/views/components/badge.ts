import { html } from "hono/html";
import type { AppStatus } from "../../lib/dokku.js";

const statusMap: Record<AppStatus, { label: string; cls: string; dot: boolean; spinner?: boolean }> = {
  loading:        { label: "checking",     cls: "dk-pill dk-pill-muted dk-pill-loading", dot: false, spinner: true },
  stale:          { label: "stale",        cls: "dk-pill dk-pill-muted", dot: false },
  running:        { label: "running",      cls: "dk-pill dk-pill-ok",    dot: true  },
  stopped:        { label: "stopped",      cls: "dk-pill dk-pill-warn",  dot: false },
  deployed:       { label: "deployed",     cls: "dk-pill dk-pill-accent", dot: false },
  "not deployed": { label: "not deployed", cls: "dk-pill dk-pill-muted", dot: false },
  failed:         { label: "failed",       cls: "dk-pill dk-pill-bad",   dot: false },
  unknown:        { label: "unknown",      cls: "dk-pill dk-pill-muted", dot: false },
};

export function statusBadge(status: string) {
  const m = statusMap[status as AppStatus] ?? statusMap.unknown;
  return html`<span class="${m.cls}">${m.spinner ? html`<span class="dk-pill-spinner"></span>` : ""}${m.dot ? html`<span class="dk-pill-dot"></span>` : ""}${m.label}</span>`;
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

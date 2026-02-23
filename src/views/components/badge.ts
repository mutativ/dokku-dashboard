import { html } from "hono/html";

const statusStyles: Record<string, string> = {
  running: "bg-green-100 text-green-700",
  stopped: "bg-red-100 text-red-700",
  deployed: "bg-blue-100 text-blue-700",
  "not deployed": "bg-gray-100 text-gray-500",
  unknown: "bg-gray-100 text-gray-500",
};

export function statusBadge(status: string) {
  const cls = statusStyles[status] ?? statusStyles.unknown;
  return html`<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${status}</span>`;
}

export function processBadge(type: string, count: number) {
  return html`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">${type}<span class="text-blue-400">&times;${String(count)}</span></span>`;
}

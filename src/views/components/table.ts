import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export interface Column {
  header: string;
  class?: string;
}

export function table(
  columns: Column[],
  rows: (HtmlEscapedString | Promise<HtmlEscapedString>)[],
  rawBody?: boolean,
) {
  return html`
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            ${raw(columns.map((col) => `<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.class ?? ""}">${col.header}</th>`).join(""))}
          </tr>
        </thead>
        ${rawBody
          ? rows
          : html`<tbody class="divide-y divide-gray-100">${rows}</tbody>`}
      </table>
    </div>
  `;
}

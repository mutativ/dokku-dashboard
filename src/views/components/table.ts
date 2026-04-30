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
    <div class="dk-card" style="overflow:hidden;padding:0">
      <table class="dk-tbl">
        <thead>
          <tr>
            ${raw(columns.map((col) => `<th class="${col.class ?? ""}">${col.header}</th>`).join(""))}
          </tr>
        </thead>
        ${rawBody
          ? rows
          : html`<tbody>${rows}</tbody>`}
      </table>
    </div>
  `;
}

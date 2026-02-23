import { html, raw } from "hono/html";
import { pageHeader } from "../components/nav.js";

interface TableInfo {
  name: string;
  type: string;
  rowEstimate: string;
}

interface SchemaColumn {
  column: string;
  type: string;
  nullable: string;
  defaultVal: string;
}

export function dbExplorerPage(dbName: string, tables: TableInfo[]) {
  return html`
    ${pageHeader(
      `${dbName}`,
      html`
        <div class="flex items-center gap-3">
          <a href="/databases/${dbName}" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; Database Info</a>
          <span class="text-gray-300">|</span>
          <span class="text-sm text-blue-600 font-medium">Explorer</span>
        </div>
      `,
    )}

    <div class="grid gap-6">
      <!-- Query Runner -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">SQL Query</h3>
        </div>
        <div class="p-4">
          <form hx-post="/databases/${dbName}/explore/query" hx-target="#query-result" hx-swap="innerHTML">
            <textarea name="sql" rows="3" placeholder="SELECT * FROM recipes LIMIT 10;"
              class="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            ></textarea>
            <div class="flex items-center justify-between mt-2">
              <span class="text-xs text-gray-400">Read-only. Only SELECT queries allowed.</span>
              <button type="submit"
                class="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors">
                Run Query
              </button>
            </div>
          </form>
          <div id="query-result" class="mt-4"></div>
        </div>
      </div>

      <!-- Tables -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">${tables.length} Tables</h3>
        </div>
        ${tables.length === 0
          ? html`<div class="px-4 py-6 text-center text-gray-400 text-sm">No tables found</div>`
          : html`
              <table class="w-full text-sm">
                <thead class="text-left text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th class="px-4 py-2.5">Name</th>
                    <th class="px-4 py-2.5">Type</th>
                    <th class="px-4 py-2.5">Est. Rows</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  ${tables.map(
                    (t) => html`
                      <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-4 py-2.5">
                          <a href="/databases/${dbName}/explore/table/${t.name}" class="text-blue-600 hover:text-blue-800">${t.name}</a>
                        </td>
                        <td class="px-4 py-2.5 text-gray-500">${t.type}</td>
                        <td class="px-4 py-2.5 text-gray-500 font-mono">${formatNumber(t.rowEstimate)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </div>
    </div>
  `;
}

export function dbTableDetailPage(
  dbName: string,
  tableName: string,
  schema: SchemaColumn[],
  preview: { columns: string[]; rows: string[][]; rowCount: number },
) {
  return html`
    ${pageHeader(
      tableName,
      html`
        <div class="flex items-center gap-3">
          <a href="/databases/${dbName}/explore" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">&larr; All Tables</a>
          <span class="text-gray-300">|</span>
          <span class="text-sm text-gray-500">${dbName}</span>
        </div>
      `,
    )}

    <div class="grid gap-6">
      <!-- Schema -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Schema (${schema.length} columns)</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-gray-500 uppercase bg-gray-50">
            <tr>
              <th class="px-4 py-2.5">Column</th>
              <th class="px-4 py-2.5">Type</th>
              <th class="px-4 py-2.5">Nullable</th>
              <th class="px-4 py-2.5">Default</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${schema.map(
              (col) => html`
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2.5 font-mono text-blue-600">${col.column}</td>
                  <td class="px-4 py-2.5 text-gray-500 font-mono text-xs">${col.type}</td>
                  <td class="px-4 py-2.5">${col.nullable === "YES"
                    ? raw('<span class="text-amber-600">yes</span>')
                    : raw('<span class="text-green-600">no</span>')}</td>
                  <td class="px-4 py-2.5 text-gray-400 font-mono text-xs">${col.defaultVal}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>

      <!-- Preview -->
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 class="text-sm font-semibold text-gray-700">Preview (${preview.rowCount} rows, limit 50)</h3>
        </div>
        ${renderResultTable(preview.columns, preview.rows)}
      </div>
    </div>
  `;
}

export function dbQueryResultPartial(
  columns: string[],
  rows: string[][],
  rowCount: number,
  elapsedMs: number,
) {
  return html`
    <div class="text-xs text-gray-400 mb-2">${rowCount} rows in ${elapsedMs}ms</div>
    ${renderResultTable(columns, rows)}
  `;
}

function renderResultTable(columns: string[], rows: string[][]) {
  if (columns.length === 0) {
    return html`<div class="px-4 py-4 text-center text-gray-400 text-sm">No results</div>`;
  }

  return html`
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
          <tr>
            ${columns.map((c) => html`<th class="px-3 py-2 whitespace-nowrap">${c}</th>`)}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 font-mono text-xs">
          ${rows.map(
            (row) => html`
              <tr class="hover:bg-gray-50 transition-colors">
                ${row.map(
                  (cell) => html`<td class="px-3 py-1.5 max-w-xs truncate text-gray-600" title="${cell}">${cell}</td>`,
                )}
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function formatNumber(n: string): string {
  const num = parseInt(n, 10);
  if (isNaN(num) || num < 0) return n;
  return num.toLocaleString();
}

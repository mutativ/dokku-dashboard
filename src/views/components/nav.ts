import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/** Breadcrumb-style page header */
export function pageHeader(
  title: string,
  actions?: HtmlEscapedString | Promise<HtmlEscapedString>,
) {
  return html`
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900">${title}</h2>
      ${actions ?? html``}
    </div>
  `;
}

/** Tabs for app detail page */
export function tabs(
  appName: string,
  active: string,
) {
  const items = [
    { id: "info", label: "Info", href: `/apps/${appName}` },
    { id: "env", label: "Env Vars", href: `/apps/${appName}/env` },
    { id: "domains", label: "Domains", href: `/apps/${appName}/domains` },
    { id: "scaling", label: "Scaling", href: `/apps/${appName}/scaling` },
    { id: "logs", label: "Logs", href: `/apps/${appName}/logs` },
  ];

  return html`
    <div class="flex gap-1 border-b border-gray-200 mb-6">
      ${items.map(
        (item) => html`
          <a href="${item.href}"
             hx-get="${item.href}?partial=1"
             hx-target="#tab-content"
             hx-push-url="${item.href}"
             class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
               item.id === active
                 ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                 : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
             }">
            ${item.label}
          </a>
        `,
      )}
    </div>
  `;
}

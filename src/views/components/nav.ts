import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export function pageHeader(
  title: string,
  actions?: HtmlEscapedString | Promise<HtmlEscapedString>,
  sub?: HtmlEscapedString | Promise<HtmlEscapedString> | string,
) {
  return html`
    <div class="dk-page-h">
      <div>
        <div class="dk-page-title">${title}</div>
        ${sub ? html`<div class="dk-page-sub">${sub}</div>` : html``}
      </div>
      ${actions ?? html``}
    </div>
  `;
}

export function tabs(appName: string, active: string) {
  const items = [
    { id: "info",    label: "Info",     href: `/apps/${appName}` },
    { id: "env",     label: "Env Vars", href: `/apps/${appName}/env` },
    { id: "domains", label: "Domains",  href: `/apps/${appName}/domains` },
    { id: "scaling", label: "Scaling",  href: `/apps/${appName}/scaling` },
    { id: "logs",    label: "Logs",     href: `/apps/${appName}/logs` },
  ];

  return html`
    <div class="dk-tabs">
      ${items.map(
        (item) => html`
          <a href="${item.href}"
             hx-get="${item.href}?partial=1"
             hx-target="#tab-content"
             hx-push-url="${item.href}"
             class="dk-tab ${item.id === active ? "is-active" : ""}">
            ${item.label}
          </a>
        `,
      )}
    </div>
  `;
}

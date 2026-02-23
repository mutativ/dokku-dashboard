import { html } from "hono/html";

export function alert(
  type: "success" | "error" | "info",
  message: string,
) {
  const styles = {
    success: "bg-green-50 border-green-200 text-green-700",
    error: "bg-red-50 border-red-200 text-red-700",
    info: "bg-blue-50 border-blue-200 text-blue-700",
  };

  return html`
    <div class="border rounded-lg px-4 py-3 mb-4 text-sm ${styles[type]}">
      ${message}
    </div>
  `;
}

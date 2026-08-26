/**
 * Local OAuth callback HTML (127.0.0.1). Inline CSS only — the loopback
 * server has no static assets. Tokens match packages/ui/src/tokens.css
 * (ADR-0014 / DESIGN.md).
 */

export type LoopbackPageKind = "success" | "error" | "not-found";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#00c2c2"/>
  <path d="M16 7.5 24 24H8L16 7.5Z" fill="#0a0e1a"/>
  <path d="M16 12.2 21.2 22.5h-10.4L16 12.2Z" fill="#00dcd4"/>
</svg>`;

export function loopbackPageHtml(
  kind: LoopbackPageKind,
  detail?: string,
): string {
  const ok = kind === "success";
  const missing = kind === "not-found";
  const title = ok
    ? "Connected"
    : missing
      ? "Nothing here"
      : "Connection did not finish";
  const lead = ok
    ? "Prism Dispatch is connected."
    : missing
      ? "This local page is only used after you grant access."
      : "Prism Dispatch could not finish the grant.";
  const hint = ok
    ? "You can close this tab. Tokens stay on this machine."
    : missing
      ? "Go back to Cursor and say connect again."
      : "Close this tab and say connect again in Cursor.";
  const status = ok ? "Connected" : missing ? "Not found" : "Did not connect";
  const error =
    !ok && !missing && detail
      ? `<p class="error">${escapeHtml(detail)}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<title>${escapeHtml(title)} · Prism</title>
<style>
  :root {
    --brand: #00c2c2;
    --brand-strong: #00dcd4;
    --on-brand: #0a0e1a;
    --ink: #ffffff;
    --muted: #94a3b8;
    --line: #2a334a;
    --panel: #131926;
    --canvas: #0a0e1a;
    --safe: #10b981;
    --risk: #f43f5e;
    --font: Inter, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: var(--font);
    color: var(--ink);
    background:
      radial-gradient(900px 420px at 12% -10%, color-mix(in srgb, var(--brand) 16%, transparent), transparent 55%),
      radial-gradient(720px 380px at 92% 0%, color-mix(in srgb, #6c63ff 14%, transparent), transparent 50%),
      var(--canvas);
    display: grid;
    place-items: center;
    padding: 24px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: min(420px, 100%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 28px 28px 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
  }
  .mark { width: 28px; height: 28px; display: block; }
  .word {
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pill::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: ${ok ? "var(--safe)" : "var(--risk)"};
  }
  h1 {
    margin: 0 0 8px;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.45;
    color: var(--muted);
  }
  .error {
    margin-top: 12px;
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 0.75rem;
    color: var(--risk);
    word-break: break-word;
  }
  .hint { margin-top: 10px; }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">${MARK}<span class="word">Prism</span></div>
    <p class="pill">${status}</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(lead)}</p>
    <p class="hint">${escapeHtml(hint)}</p>
    ${error}
  </main>
</body>
</html>`;
}

export const DEFAULT_LOOPBACK_SUCCESS_HTML = loopbackPageHtml("success");

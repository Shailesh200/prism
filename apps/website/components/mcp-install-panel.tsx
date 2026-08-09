"use client";

import { useState } from "react";
import {
  PRISM_CLAUDE_CODE_COMMAND,
  PRISM_MCP_JSON_STRING,
  cursorMcpInstallHref,
  vscodeMcpInstallHref,
} from "@/lib/mcp-install";

type CopyBlockProps = {
  label: string;
  value: string;
  hint?: string;
};

function CopyBlock({ label, value, hint }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-fd-border bg-fd-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fd-foreground">{label}</span>
        <button
          type="button"
          className="shrink-0 rounded-md border border-fd-border px-2.5 py-1 text-xs text-fd-foreground hover:border-fd-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-fd-primary">
        {value}
      </pre>
      {hint ? <p className="text-xs text-fd-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function McpInstallPanel() {
  const cursorHref = cursorMcpInstallHref();
  const vscodeHref = vscodeMcpInstallHref();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <a
          href={cursorHref}
          className="rounded-md bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground"
        >
          Add to Cursor
        </a>
        <a
          href={vscodeHref}
          className="rounded-md border border-fd-border px-4 py-2.5 text-sm text-fd-foreground hover:border-fd-primary"
        >
          Add to VS Code
        </a>
      </div>

      <CopyBlock
        label="Cursor / Claude Desktop — `.cursor/mcp.json` or global config"
        value={PRISM_MCP_JSON_STRING.trim()}
        hint="Save at the project root, then Settings → MCP → enable prism (~32 tools)."
      />

      <CopyBlock
        label="Claude Code — one command"
        value={PRISM_CLAUDE_CODE_COMMAND}
        hint="Run inside your project directory. Restart Claude Code if it was already open."
      />
    </div>
  );
}

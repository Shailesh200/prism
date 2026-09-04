"use client";

import { useState } from "react";
import {
  CLAUDE_DESKTOP_CONFIG_PATHS,
  PRISM_CLAUDE_CODE_COMMAND,
  PRISM_CODEX_TOML,
  PRISM_MCP_JSON_STRING,
  PRISM_TOOL_COUNT,
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

/**
 * The clients Prism documents.
 *
 * One tab each rather than one long column: this panel now belongs on the home
 * page, and five stacked config blocks would push everything below it off the
 * screen for four readers out of five.
 */
const CLIENTS = [
  "Cursor",
  "Claude Code",
  "Claude Desktop",
  "Codex",
  "VS Code",
] as const;

type Client = (typeof CLIENTS)[number];

export function McpInstallPanel() {
  const [client, setClient] = useState<Client>("Cursor");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Install Prism in your editor"
        className="flex flex-wrap gap-2"
      >
        {CLIENTS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={client === name}
            onClick={() => setClient(name)}
            className={
              client === name
                ? "rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground"
                : "rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-muted-foreground hover:border-fd-primary hover:text-fd-foreground"
            }
          >
            {name}
          </button>
        ))}
      </div>

      {client === "Cursor" ? (
        <div className="space-y-4">
          <a
            href={cursorMcpInstallHref()}
            className="inline-block rounded-md bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground"
          >
            Add to Cursor
          </a>
          <CopyBlock
            label="Or paste into `.cursor/mcp.json`"
            value={PRISM_MCP_JSON_STRING.trim()}
            hint={`Project root, or ~/.cursor/mcp.json for every project. Then Settings → MCP → enable prism (${PRISM_TOOL_COUNT} tools).`}
          />
        </div>
      ) : null}

      {client === "Claude Code" ? (
        <CopyBlock
          label="One command"
          value={PRISM_CLAUDE_CODE_COMMAND}
          hint="Run inside your project directory. Restart Claude Code if it was already open. Jobs run on the Claude you are already signed in to."
        />
      ) : null}

      {client === "Claude Desktop" ? (
        <div className="space-y-4">
          <CopyBlock
            label={`Add to ${CLAUDE_DESKTOP_CONFIG_PATHS.macos}`}
            value={PRISM_MCP_JSON_STRING.trim()}
            hint={`Windows: ${CLAUDE_DESKTOP_CONFIG_PATHS.windows}. Quit and reopen Claude afterwards.`}
          />
          <p className="text-xs text-fd-muted-foreground">
            Claude Desktop starts MCP from a fixed directory. If Prism reports
            the wrong repository, add{" "}
            <code className="font-mono text-fd-primary">
              &quot;PRISM_WORKSPACE&quot;: &quot;/absolute/path/to/project&quot;
            </code>{" "}
            to the same <code className="font-mono">env</code> block.
          </p>
        </div>
      ) : null}

      {client === "Codex" ? (
        <CopyBlock
          label="Add to ~/.codex/config.toml"
          value={PRISM_CODEX_TOML.trim()}
          hint="Codex reads TOML, not JSON. Run Codex from inside your project directory."
        />
      ) : null}

      {client === "VS Code" ? (
        <div className="space-y-4">
          <a
            href={vscodeMcpInstallHref()}
            className="inline-block rounded-md bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground"
          >
            Add to VS Code
          </a>
          <CopyBlock
            label="Or paste into your MCP config"
            value={PRISM_MCP_JSON_STRING.trim()}
          />
        </div>
      ) : null}
    </div>
  );
}

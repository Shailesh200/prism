"use client";

import { useId, useState } from "react";
import { cursorMcpInstallHref } from "@/lib/mcp-install";
import { ConfigBlock, Terminal } from "./blocks";

export function InstallTabs({
  command,
  commandLines,
  configPath,
  configLang,
  config,
  configNote,
}: {
  command: string;
  commandLines: string[];
  configPath: string;
  configLang: string;
  config: string;
  configNote?: string;
}) {
  const [tab, setTab] = useState<"terminal" | "config" | "cursor">("terminal");
  const id = useId();
  const href = cursorMcpInstallHref();
  const tabs = [
    ["terminal", "Terminal"],
    ["config", "MCP config"],
    ["cursor", "Add to Cursor"],
  ] as const;

  return (
    <div className="pair">
      <div className="tabs" role="tablist" aria-label="Install method">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panes">
        <div className={`pane${tab === "terminal" ? " on" : ""}`} role="tabpanel" id={`${id}-terminal-panel`} hidden={tab !== "terminal"}>
          <Terminal title="~/repo" command={command} lines={commandLines.map((line) => line)} />
        </div>
        <div className={`pane${tab === "config" ? " on" : ""}`} role="tabpanel" id={`${id}-config-panel`} hidden={tab !== "config"}>
          <ConfigBlock path={configPath} lang={configLang} code={config} note={configNote} />
        </div>
        <div className={`pane${tab === "cursor" ? " on" : ""}`} role="tabpanel" id={`${id}-cursor-panel`} hidden={tab !== "cursor"}>
          <div className="card">
            <h3 className="t">Add the Prism MCP server in Cursor</h3>
            <p>
              Opens Cursor and asks before it adds the server. The config is the same <code>npx</code> entry as{" "}
              <code>packages/mcp-server/mcp-install.json</code>, including <code>NODE_USE_SYSTEM_CA=1</code>.
            </p>
            <div style={{ marginTop: 18 }}>
              <a className="btn cur" href={href}>
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M10 1.8l7.2 4.1v8.2L10 18.2l-7.2-4.1V5.9z" />
                  <path d="M2.8 5.9L10 10l7.2-4.1M10 10v8.2" />
                </svg>
                Add to Cursor
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

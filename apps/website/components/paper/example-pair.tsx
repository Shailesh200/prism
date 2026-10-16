"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export function ExamplePair({
  agent,
  terminal,
  label = "Same answer, two views",
}: {
  agent: ReactNode;
  terminal: ReactNode;
  label?: string;
}) {
  const [tab, setTab] = useState<"agent" | "terminal">("agent");
  const id = useId();

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    setTab((current) => (current === "agent" ? "terminal" : "agent"));
  }

  return (
    <div className="pair">
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        <button
          type="button"
          role="tab"
          id={`${id}-agent`}
          aria-selected={tab === "agent"}
          aria-controls={`${id}-agent-panel`}
          tabIndex={tab === "agent" ? 0 : -1}
          onClick={() => setTab("agent")}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M3 3h10v8H3z" fill="none" stroke="currentColor" />
            <path d="M6 13h4" stroke="currentColor" />
          </svg>
          Agent
        </button>
        <button
          type="button"
          role="tab"
          id={`${id}-terminal`}
          aria-selected={tab === "terminal"}
          aria-controls={`${id}-terminal-panel`}
          tabIndex={tab === "terminal" ? 0 : -1}
          onClick={() => setTab("terminal")}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M3 4l4 4-4 4M8 12h5" fill="none" stroke="currentColor" />
          </svg>
          Terminal
        </button>
      </div>
      <div className="panes">
        <div
          className={`pane${tab === "agent" ? " on" : ""}`}
          role="tabpanel"
          id={`${id}-agent-panel`}
          aria-labelledby={`${id}-agent`}
          hidden={tab !== "agent"}
        >
          {agent}
        </div>
        <div
          className={`pane${tab === "terminal" ? " on" : ""}`}
          role="tabpanel"
          id={`${id}-terminal-panel`}
          aria-labelledby={`${id}-terminal`}
          hidden={tab !== "terminal"}
        >
          {terminal}
        </div>
      </div>
    </div>
  );
}

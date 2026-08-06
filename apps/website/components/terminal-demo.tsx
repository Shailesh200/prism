"use client";

import { useEffect, useState } from "react";

const LINES = [
  { text: "$ prism dna", className: "text-fd-muted-foreground" },
  {
    text: "Repository DNA · typescript · monorepo",
    className: "text-fd-primary",
  },
  {
    text: "domains  frontend · backend · testing",
    className: "text-fd-foreground",
  },
  { text: "packages  18  ·  files  1,240", className: "text-fd-foreground" },
  { text: "", className: "" },
  {
    text: "$ prism blast packages/core/src/index.ts",
    className: "text-fd-muted-foreground",
  },
  { text: "Blast radius · risk  amber", className: "text-amber-500" },
  {
    text: "  12 dependents  ·  4 tests  ·  2 features",
    className: "text-fd-foreground",
  },
  {
    text: "  review before edit — see /docs/guides/before-you-edit",
    className: "text-fd-muted-foreground",
  },
];

export function TerminalDemo() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible < LINES.length) {
      const delay = LINES[visible]?.text === "" ? 280 : 420;
      const id = window.setTimeout(() => setVisible((v) => v + 1), delay);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setVisible(0), 5000);
    return () => window.clearTimeout(id);
  }, [visible]);

  return (
    <div className="overflow-hidden rounded-xl border border-fd-border bg-[color-mix(in_oklab,var(--prism-panel)_92%,black)] shadow-lg">
      <div className="flex items-center gap-2 border-b border-fd-border px-4 py-2">
        <span className="size-2.5 rounded-full bg-[#f43f5e]/60" />
        <span className="size-2.5 rounded-full bg-[#f59e0b]/60" />
        <span className="size-2.5 rounded-full bg-[#10b981]/60" />
        <span className="ml-2 font-mono text-xs text-fd-muted-foreground">
          terminal — local, no network
        </span>
      </div>
      <pre className="min-h-[220px] overflow-x-auto p-4 font-mono text-[13px] leading-6">
        {LINES.slice(0, visible).map((line, i) => (
          <div
            key={`${i}-${line.text}`}
            className={line.className || undefined}
          >
            {line.text || "\u00a0"}
          </div>
        ))}
        {visible < LINES.length ? (
          <span className="inline-block h-4 w-2 animate-pulse bg-fd-primary align-middle" />
        ) : null}
      </pre>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SLIDES = [
  {
    id: "ide",
    label: "IDE Extension",
    command: "code --install-extension prismhq.repo-prism",
    hint: "Or search Prism in VS Code / Cursor Extensions",
    href: "/docs/ide/install",
  },
  {
    id: "cli",
    label: "CLI",
    command: "npx -y @repo-prism/cli doctor",
    hint: "Run inside your project — uses the git root",
    href: "/docs/cli/install",
  },
  {
    id: "mcp",
    label: "MCP",
    command:
      "claude mcp add prism -- npx -y --prefer-online @repo-prism/mcp-server@latest",
    hint: "Cursor: Add to Cursor on prismhq.in/benchmarks · ~40 tools",
    href: "/docs/mcp/install",
  },
] as const;

const INTERVAL_MS = 3000;

export function CopyInstall() {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
      setCopied(false);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const slide = SLIDES[index]!;

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Install surface"
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={
                i === index
                  ? "rounded-md bg-fd-primary px-2.5 py-1 text-xs font-medium text-fd-primary-foreground"
                  : "rounded-md px-2.5 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground"
              }
              onClick={() => {
                setIndex(i);
                setCopied(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Link
          href={slide.href}
          className="shrink-0 text-xs text-fd-primary hover:underline"
        >
          Guide →
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <code
          key={slide.id}
          className="block break-all font-mono text-sm text-fd-primary"
        >
          {slide.command}
        </code>
        <button
          type="button"
          className="shrink-0 rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-foreground hover:border-fd-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(slide.command);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="text-xs text-fd-muted-foreground">{slide.hint}</p>

      <div className="flex gap-1.5" aria-hidden>
        {SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={
              i === index
                ? "h-1 w-6 rounded-full bg-fd-primary"
                : "h-1 w-1.5 rounded-full bg-fd-border"
            }
          />
        ))}
      </div>
    </div>
  );
}

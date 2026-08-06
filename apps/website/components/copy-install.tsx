"use client";

import { useState } from "react";

export function CopyInstall({
  command = "npm install -g @repo-prism/cli",
}: {
  command?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <code className="font-mono text-sm text-fd-primary">{command}</code>
      <button
        type="button"
        className="rounded-md border border-fd-border px-3 py-1.5 text-sm text-fd-foreground hover:border-fd-primary"
        onClick={async () => {
          await navigator.clipboard.writeText(command);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

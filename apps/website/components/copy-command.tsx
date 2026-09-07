"use client";

import { useState } from "react";

export function CopyCommand({
  command,
  className = "",
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-fd-border bg-fd-card px-4 py-3 ${className}`}
    >
      <code className="min-w-0 flex-1 break-all font-mono text-sm text-fd-primary">
        <span className="mr-2 text-fd-muted-foreground">$</span>
        {command}
      </code>
      <button
        type="button"
        className="shrink-0 rounded-md border border-fd-border px-3 py-1.5 text-xs text-fd-foreground hover:border-fd-primary"
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

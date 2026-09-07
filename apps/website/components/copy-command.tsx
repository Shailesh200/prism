"use client";

import { useState } from "react";
import { installCopyTarget, prismhqEvents, trackProps } from "@/lib/pulse";

export function CopyCommand({
  command,
  className = "",
  trackTarget,
}: {
  command: string;
  className?: string;
  trackTarget?: string;
}) {
  const [copied, setCopied] = useState(false);
  const target = trackTarget ?? installCopyTarget(command) ?? "command";

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
        {...trackProps(prismhqEvents.installCopy, target)}
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

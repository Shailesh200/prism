"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className = "copy",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard can be denied; the label still confirms the click */
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  }

  return (
    <button
      type="button"
      className={`${className}${done ? " done" : ""}`}
      onClick={onCopy}
      aria-label={done ? "Copied" : label}
    >
      {done ? "Copied" : label === "Copy" && className === "copy" ? (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect x="5" y="5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" />
          <path d="M3 11V3h8" fill="none" stroke="currentColor" />
        </svg>
      ) : (
        label
      )}
    </button>
  );
}

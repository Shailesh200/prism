"use client";

import { useEffect, useRef, useState } from "react";
import { installCopyTarget, prismhqEvents, trackProps } from "@/lib/pulse";
import { cx } from "./cx";
import { CopyIcon } from "./icons";

/** Copies `text`; `done` is true for `ms` after a successful copy. */
export function useCopy(text: string, ms = 1600) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), ms);
  }

  return { done, copy };
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { done, copy } = useCopy(text);
  return (
    <button
      type="button"
      className={cx("copy", done && "done")}
      aria-label="Copy"
      title="Copy"
      onClick={copy}
      {...trackProps(
        prismhqEvents.installCopy,
        installCopyTarget(text) ?? "command",
      )}
    >
      {done ? (
        "✓"
      ) : (
        <>
          <CopyIcon />
          {label}
        </>
      )}
    </button>
  );
}

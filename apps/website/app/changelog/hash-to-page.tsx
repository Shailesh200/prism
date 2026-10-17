"use client";

import { useEffect } from "react";

/** Sends a #version link to the changelog page that holds that version. */
export function HashToPage({ targets }: { targets: Record<string, string> }) {
  useEffect(() => {
    const go = () => {
      const version = decodeURIComponent(window.location.hash.slice(1));
      const href = targets[version];
      if (href) window.location.replace(href);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [targets]);
  return null;
}

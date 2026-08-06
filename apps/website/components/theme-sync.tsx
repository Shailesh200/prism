"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/** Keep data-theme in sync with next-themes class for @repo-prism/ui tokens. */
export function ThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  return null;
}

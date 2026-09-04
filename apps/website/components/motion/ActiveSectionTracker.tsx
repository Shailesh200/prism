"use client";

import { useEffect, useState } from "react";

/**
 * Which section is currently in view.
 *
 * `IntersectionObserver` rather than a scroll handler: the browser does this
 * off the main thread, and a scroll listener that calls
 * `getBoundingClientRect` per section is the classic way to make a page janky
 * with the code meant to make it feel smooth.
 *
 * The `rootMargin` shrinks the viewport to a band near the top, so "active"
 * means "the heading you are reading", not "anything on screen" — otherwise
 * three sections are active at once on a tall display.
 */
export function useActiveSection(ids: readonly string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0]);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.id, entry.isIntersecting);
        }
        // First in document order wins. Scrolling up, several can be in the
        // band at once, and picking the last one makes the marker jump
        // backwards past sections the reader never stopped at.
        const current = ids.find((id) => seen.get(id));
        if (current) setActive(current);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  return active;
}

interface ActiveSectionTrackerProps {
  ids: readonly string[];
  children: (active: string | undefined) => React.ReactNode;
}

/** Render-prop wrapper, for callers that are not already client components. */
export function ActiveSectionTracker({
  ids,
  children,
}: ActiveSectionTrackerProps) {
  return <>{children(useActiveSection(ids))}</>;
}

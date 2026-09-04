"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { ensureGsap } from "@/lib/gsap";

/**
 * A progress bar across the top during a route change.
 *
 * The hard rule is that it must never outlast the navigation it covers. App
 * Router gives no "navigation started" event, so this keys off `usePathname`:
 * the bar appears when the path changes and finishes on the next paint, when
 * the new route's content is already committed. A timer-driven bar that runs
 * for a fixed 800ms is worse than no bar, because it is lying half the time.
 */
export function RouteLoader() {
  const pathname = usePathname();
  const bar = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // The initial render is not a navigation. Showing a loader for it means
    // every visitor sees a bar for a page that was already there.
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(true);
    return () => setActive(false);
  }, [pathname]);

  useEffect(() => {
    const el = bar.current;
    if (!active || reduced || !el) return;

    const gsap = ensureGsap();
    const tl = gsap.timeline();
    tl.set(el, { scaleX: 0, autoAlpha: 1, transformOrigin: "left center" })
      // Runs to 90% quickly, then completes. The new route is already
      // rendered by the time this effect runs, so the tail is honest
      // acknowledgement rather than fake progress.
      .to(el, { scaleX: 0.9, duration: 0.22, ease: "power2.out" })
      .to(el, { scaleX: 1, duration: 0.12, ease: "power1.inOut" })
      .to(el, { autoAlpha: 0, duration: 0.18 })
      .set(el, { scaleX: 0 });

    return () => {
      tl.kill();
      gsap.set(el, { autoAlpha: 0, scaleX: 0 });
    };
  }, [active, reduced]);

  return (
    <div
      ref={bar}
      aria-hidden
      className="prism-route-loader"
      style={{ opacity: 0 }}
    />
  );
}

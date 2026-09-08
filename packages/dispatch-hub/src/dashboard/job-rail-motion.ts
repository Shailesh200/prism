/**
 * GSAP draw for the job lifecycle graph (Console only).
 *
 * The board itself lives in `@repo-prism/app-shell` and must stay CSS-only
 * (ADR-0051). Completed hops fill onto the next node. The current step has
 * no outgoing connector — it blinks in CSS until the job proceeds.
 */
import gsap from "gsap";
import { useLayoutEffect, type RefObject } from "react";

export function useJobRailMotion(
  root: RefObject<HTMLElement | null>,
  signature: string,
): void {
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const el = host.querySelector<HTMLElement>(".job-rail") ?? host;
    const doneSegs = el.querySelectorAll<HTMLElement>(
      ".job-rail__step--reached:not(.job-rail__step--current) .job-rail__seg",
    );
    const nodes = el.querySelectorAll<HTMLElement>(
      ".job-rail__step--reached:not(.job-rail__step--current) .job-rail__node",
    );
    const tweens: gsap.core.Tween[] = [];
    if (doneSegs.length > 0) {
      tweens.push(
        gsap.fromTo(
          doneSegs,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.45,
            stagger: 0.1,
            ease: "power3.out",
            transformOrigin: "0% 50%",
            overwrite: "auto",
          },
        ),
      );
    }
    if (nodes.length > 0) {
      tweens.push(
        gsap.from(nodes, {
          scale: 0.35,
          opacity: 0.25,
          duration: 0.4,
          stagger: 0.09,
          ease: "back.out(1.7)",
          overwrite: "auto",
        }),
      );
    }
    return () => {
      for (const tween of tweens) tween.kill();
    };
  }, [root, signature]);
}

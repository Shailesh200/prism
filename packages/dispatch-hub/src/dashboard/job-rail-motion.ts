/**
 * GSAP draw for the job lifecycle timeline (Console only).
 *
 * The board itself lives in `@repo-prism/app-shell` and must stay CSS-only
 * (ADR-0051). The Console bundle tweens each reached connector from its node,
 * then pops the reached nodes.
 */
import gsap from "gsap";
import { useLayoutEffect, type RefObject } from "react";

export function useJobRailMotion(
  root: RefObject<HTMLElement | null>,
  signature: string,
): void {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const segs = el.querySelectorAll<HTMLElement>(
      ".job-rail__step--reached .job-rail__seg",
    );
    const nodes = el.querySelectorAll<HTMLElement>(
      ".job-rail__step--reached .job-rail__node",
    );
    const tweens: gsap.core.Tween[] = [];
    if (segs.length > 0) {
      tweens.push(
        gsap.fromTo(
          segs,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.45,
            stagger: 0.12,
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

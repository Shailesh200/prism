/**
 * GSAP draw for the job lifecycle timeline (Console only).
 *
 * The board itself lives in `@repo-prism/app-shell` and must stay CSS-only
 * (ADR-0051). The Console bundle tweens the single fill bar to the honest
 * `--job-rail-fill` value, then pops the reached nodes.
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
    const fills = el.querySelectorAll<HTMLElement>(".job-rail__fill");
    const nodes = el.querySelectorAll<HTMLElement>(
      ".job-rail__step--reached .job-rail__node",
    );
    const tweens: gsap.core.Tween[] = [];
    fills.forEach((fill) => {
      const rail = fill.closest<HTMLElement>(".job-rail");
      const raw = rail?.style.getPropertyValue("--job-rail-fill") ?? "0";
      const target = Number.parseFloat(raw);
      tweens.push(
        gsap.fromTo(
          fill,
          { scaleX: 0 },
          {
            scaleX: Number.isFinite(target) ? target : 1,
            duration: 0.75,
            ease: "power3.out",
            transformOrigin: "0% 50%",
            overwrite: "auto",
          },
        ),
      );
    });
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

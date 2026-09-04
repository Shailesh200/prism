"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { staggerStep } from "@repo-prism/ui";
import { ensureGsap, prefersReducedMotion, safeSetVisible } from "@/lib/gsap";

interface StaggerGridProps {
  children: ReactNode;
  className?: string;
  /** CSS selector for the items to stagger. Direct children by default. */
  items?: string;
}

/**
 * Plays a grid or list in, one item after the next.
 *
 * One ScrollTrigger for the container rather than one per card. A trigger per
 * item on a long list means dozens of scroll listeners doing the same work,
 * and they fire in scroll order rather than reading order once the grid wraps.
 *
 * The delay between items comes from a fixed budget (`staggerStep`), so a
 * forty-row list finishes in the same time a four-row one does instead of
 * still animating after the reader has moved on.
 */
export function StaggerGrid({
  children,
  className = "",
  items,
}: StaggerGridProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const gsap = ensureGsap();
      const targets = items
        ? Array.from(el.querySelectorAll(items))
        : Array.from(el.children);
      if (targets.length === 0) return;

      if (prefersReducedMotion()) {
        safeSetVisible(targets);
        return;
      }

      /**
       * Content is never left invisible because an animation did not finish.
       * Hidden marketing copy is worse than unanimated marketing copy.
       *
       * Armed when the tween starts, not on mount: a fixed timer from mount
       * either expires before the reader scrolls down (doing nothing) or
       * fires mid-animation for a grid they just reached (aborting it).
       *
       * Checks the *last* target. A background tab throttles
       * requestAnimationFrame to roughly once a second, so a staggered tween
       * crawls and the rows end up strung out between 0.1 and 0.9 opacity —
       * with the first one finished. Testing item one sees a completed
       * animation and leaves the rest half-faded.
       */
      let safety = 0;
      const armSafety = (): void => {
        safety = window.setTimeout(() => {
          const last = targets.at(-1) as Element | undefined;
          if (last && Number(gsap.getProperty(last, "opacity")) < 0.95) {
            safeSetVisible(targets);
          }
        }, 1600);
      };

      const tween = gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          ease: "power3.out",
          stagger: staggerStep(targets.length) / 1000,
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
            onEnter: armSafety,
          },
          onComplete: () => {
            window.clearTimeout(safety);
            safeSetVisible(targets);
          },
        },
      );

      return () => {
        window.clearTimeout(safety);
        tween.scrollTrigger?.kill();
        tween.kill();
        safeSetVisible(targets);
      };
    },
    { dependencies: [items] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

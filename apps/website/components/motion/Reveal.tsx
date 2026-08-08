"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { ensureGsap, prefersReducedMotion, safeSetVisible } from "@/lib/gsap";

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
}

/** Safe scroll reveal — never leaves content permanently hidden. */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 20,
  x = 0,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const gsap = ensureGsap();

      if (prefersReducedMotion()) {
        safeSetVisible(el);
        return;
      }

      const tween = gsap.fromTo(
        el,
        { autoAlpha: 0, y, x },
        {
          autoAlpha: 1,
          y: 0,
          x: 0,
          duration: 0.65,
          delay,
          ease: "power3.out",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
            once: true,
          },
          onComplete: () => safeSetVisible(el),
        },
      );

      const safety = window.setTimeout(() => {
        if (Number(gsap.getProperty(el, "opacity")) < 0.5) {
          safeSetVisible(el);
        }
      }, 1200);

      return () => {
        window.clearTimeout(safety);
        tween.scrollTrigger?.kill();
        tween.kill();
        safeSetVisible(el);
      };
    },
    { dependencies: [delay, y, x] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

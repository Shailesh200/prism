"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { ensureGsap, prefersReducedMotion } from "@/lib/gsap";

interface CounterProps {
  value: number;
  /** Decimal places. Whole numbers by default. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands (1,234). A boolean, not a formatter function: a server
   *  component cannot pass a function across the client boundary. */
  grouped?: boolean;
  className?: string;
}

/**
 * Counts a real number up when it scrolls into view.
 *
 * Renders the final value as the server-rendered text and animates from zero
 * only on the client. That ordering matters: the number is the content, so it
 * has to be correct with JavaScript disabled, correct for a crawler, and
 * correct for a screen reader. Starting the markup at "0" and relying on a
 * tween to fix it would fail all three.
 */
export function Counter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  grouped = false,
  className = "",
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const show = (n: number): string =>
    `${prefix}${
      grouped
        ? n.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : n.toFixed(decimals)
    }${suffix}`;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const gsap = ensureGsap();
      const state = { n: 0 };

      const tween = gsap.to(state, {
        n: value,
        duration: 1.1,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: () => {
          el.textContent = show(state.n);
        },
        onComplete: () => {
          // Snapped back to the exact prop rather than left on the tween's
          // last frame, which can land a hair under on a dropped frame.
          el.textContent = show(value);
        },
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        el.textContent = show(value);
      };
    },
    { dependencies: [value, decimals, prefix, suffix, grouped] },
  );

  return (
    <span ref={ref} className={className}>
      {show(value)}
    </span>
  );
}

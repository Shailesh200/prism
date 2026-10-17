"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Adds `play` once the element is a quarter in view, as the design does for
 * `.vis` and `.slip`. With reduced motion, or without IntersectionObserver,
 * it sets data-static and the CSS shows the final state.
 */
export function Reveal({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "play" | "static">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setState("static");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setState("play");
        io.disconnect();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      data-reveal=""
      data-play={state === "play" || undefined}
      data-static={state === "static" || undefined}
    >
      {children}
    </div>
  );
}

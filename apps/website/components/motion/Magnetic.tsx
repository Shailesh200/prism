"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ensureGsap, prefersReducedMotion } from "@/lib/gsap";

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** How far the element leans toward the pointer, in pixels. */
  strength?: number;
}

/**
 * Leans a control toward the pointer while it is nearby.
 *
 * Only for the one primary call to action on a page. Applied broadly it stops
 * reading as polish and starts reading as a page that will not hold still —
 * and it moves the click target out from under a pointer that is aiming at it.
 *
 * The transform is on a wrapper, not on the child, so an anchor keeps its own
 * hover and focus styles and its hit area stays where the browser thinks it is
 * for keyboard and assistive navigation.
 */
export function Magnetic({
  children,
  className = "",
  strength = 12,
}: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;

    const gsap = ensureGsap();
    const toX = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
    const toY = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });

    const onMove = (event: PointerEvent): void => {
      const box = el.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      // Normalised by half the element, then clamped: without the clamp a
      // pointer at the far corner throws the button across the section.
      toX(
        gsap.utils.clamp(-strength, strength, (dx / box.width) * strength * 2),
      );
      toY(
        gsap.utils.clamp(-strength, strength, (dy / box.height) * strength * 2),
      );
    };

    const onLeave = (): void => {
      toX(0);
      toY(0);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [strength]);

  return (
    <span
      ref={ref}
      className={`inline-block will-change-transform ${className}`}
    >
      {children}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { ensureGsap } from "@/lib/gsap";

/**
 * A cursor dot with a ring that trails it.
 *
 * Position is written with `gsap.quickTo`, not React state: a pointermove
 * handler that calls `setState` re-renders the whole tree on every mouse
 * movement, which is how a cursor effect ends up costing more than everything
 * else on the page.
 *
 * Renders nothing at all — not a hidden element — for touch users and anyone
 * who asked for reduced motion. On a touch device there is no pointer to
 * decorate, and a fixed element that follows nothing is a scroll-blocking
 * artefact.
 */
export function CustomCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);
  const enabled = finePointer && !reduced;

  useEffect(() => {
    // `hover: hover` is the honest test. Width-based breakpoints call a small
    // laptop a phone and a tablet with a mouse a phone twice over.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    setFinePointer(fine.matches);
    const onChange = (event: MediaQueryListEvent) =>
      setFinePointer(event.matches);
    fine.addEventListener("change", onChange);
    return () => fine.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dotEl = dot.current;
    const ringEl = ring.current;
    if (!dotEl || !ringEl) return;

    const gsap = ensureGsap();
    const dotX = gsap.quickTo(dotEl, "x", { duration: 0.12, ease: "power3" });
    const dotY = gsap.quickTo(dotEl, "y", { duration: 0.12, ease: "power3" });
    const ringX = gsap.quickTo(ringEl, "x", { duration: 0.4, ease: "power3" });
    const ringY = gsap.quickTo(ringEl, "y", { duration: 0.4, ease: "power3" });

    // The custom cursor is the cursor now: hide the native arrow for as long
    // as this effect lives. Scoped to a class on <html> so touch users and
    // reduced-motion viewers — who never mount this — keep the OS cursor.
    document.documentElement.classList.add("prism-cursor-active");

    let visible = false;
    const showAt = (x: number, y: number): void => {
      document.documentElement.classList.add("prism-cursor-active");
      if (!visible) {
        visible = true;
        // Snap only — do not killTweensOf the elements. That destroys the
        // quickTo handles and the dot freezes at this position.
        gsap.set([dotEl, ringEl], { x, y });
        gsap.to([dotEl, ringEl], {
          autoAlpha: 1,
          duration: 0.18,
          overwrite: "auto",
        });
      }
      dotX(x);
      dotY(y);
      ringX(x);
      ringY(y);
    };
    const onMove = (event: PointerEvent): void => {
      showAt(event.clientX, event.clientY);
    };

    let hot = false;
    let pressed = false;
    const paint = (): void => {
      gsap.to(ringEl, {
        scale: pressed ? 0.7 : hot ? 1.6 : 1,
        backgroundColor: hot
          ? "color-mix(in oklab, var(--prism-brand) 14%, transparent)"
          : "transparent",
        duration: 0.2,
      });
      gsap.to(dotEl, { scale: pressed ? 1.8 : 1, duration: 0.2 });
    };

    const onOver = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      const nextHot = Boolean(
        target?.closest(
          "a, button, [role='tab'], [role='link'], input, textarea, select, summary, label",
        ),
      );
      if (nextHot !== hot) {
        hot = nextHot;
        paint();
      }
    };

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      pressed = true;
      paint();
    };
    const onUp = (): void => {
      if (!pressed) return;
      pressed = false;
      paint();
    };

    // Only hide when the pointer actually left the document (relatedTarget
    // is null). window blur / mouseleave fire when focus moves to Cursor
    // chrome or a child overlay and were freezing the follow tweens.
    const hide = (): void => {
      if (!visible) return;
      visible = false;
      document.documentElement.classList.remove("prism-cursor-active");
      gsap.to([dotEl, ringEl], {
        autoAlpha: 0,
        duration: 0.15,
        overwrite: "auto",
      });
    };
    const onLeave = (event: PointerEvent): void => {
      if (event.relatedTarget) return;
      hide();
    };
    const onVisibility = (): void => {
      if (document.hidden) hide();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.documentElement.classList.remove("prism-cursor-active");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      gsap.killTweensOf([dotEl, ringEl]);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="prism-cursor-root">
      <div ref={ring} className="prism-cursor-ring" />
      <div ref={dot} className="prism-cursor-dot" />
    </div>
  );
}

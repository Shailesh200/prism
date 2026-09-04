"use client";

import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * Only plugins something on the site actually tweens are registered here.
 * A registered plugin is a bundled plugin, so MotionPath and Flip stay out
 * until a component needs them: ScrollTrigger for reveals, SplitText for the
 * hero, DrawSVG for the hero chart, ScrollTo for docs anchors.
 */
let registered = false;

export function ensureGsap() {
  if (!registered) {
    gsap.registerPlugin(
      ScrollTrigger,
      SplitText,
      DrawSVGPlugin,
      ScrollToPlugin,
    );
    registered = true;
  }
  return gsap;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Subscribe to reduced-motion changes. The one-shot read above answers "should
 * this tween run", but a viewer who turns the OS setting on mid-session would
 * otherwise keep the motion until a reload — so chrome that lives for the whole
 * session (cursor, route loader) listens instead of reading once.
 *
 * Returns an unsubscribe function.
 */
export function onReducedMotionChange(fn: (reduced: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  const handler = (event: MediaQueryListEvent) => fn(event.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

/** Force element(s) visible and strip GSAP inline styles that can trap opacity. */
export function safeSetVisible(targets: gsap.TweenTarget) {
  const g = ensureGsap();
  g.set(targets, { clearProps: "all", autoAlpha: 1, y: 0, x: 0 });
}

/** Kill tween + related ScrollTrigger and clear inline styles on its targets. */
export function killAndClear(
  tween?: {
    kill: () => void;
    scrollTrigger?: { kill: () => void } | null;
  } | null,
  targets?: gsap.TweenTarget,
) {
  if (!tween) return;
  tween.scrollTrigger?.kill();
  tween.kill();
  if (targets) safeSetVisible(targets);
}

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, ScrollToPlugin };

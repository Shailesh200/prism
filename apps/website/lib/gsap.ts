"use client";

import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

let registered = false;

export function ensureGsap() {
  if (!registered) {
    gsap.registerPlugin(
      ScrollTrigger,
      SplitText,
      DrawSVGPlugin,
      MotionPathPlugin,
      ScrollToPlugin,
      Flip,
    );
    registered = true;
  }
  return gsap;
}

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

export {
  gsap,
  ScrollTrigger,
  SplitText,
  DrawSVGPlugin,
  MotionPathPlugin,
  ScrollToPlugin,
  Flip,
};

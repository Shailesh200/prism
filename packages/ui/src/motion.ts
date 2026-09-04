/**
 * Shared motion vocabulary (ADR-0051).
 *
 * Durations and easings, and nothing that animates. Deliberately: the website
 * animates with GSAP and the IDE webview animates with CSS, and this module is
 * imported by both — a dependency here would land ~70 kB of tween engine in a
 * webview that only needed a transition.
 *
 * The numbers mirror the `--prism-dur-*` and `--prism-ease*` custom properties
 * in `tokens.css`, which is where CSS reads them. JS cannot read a custom
 * property before paint without forcing layout, so the values exist twice;
 * `motion.test.ts` fails when the two copies disagree.
 */

/** Milliseconds, matching `--prism-dur-1` … `--prism-dur-4`. */
export const PRISM_DURATION = {
  /** State flips: a toggle, a pill changing colour. */
  instant: 120,
  /** The default. Hovers, focus rings, small reveals. */
  quick: 200,
  /** Entering content: a row appearing, a panel opening. */
  settle: 320,
  /** Whole-view transitions. The longest thing Prism should ever animate. */
  view: 480,
} as const;

export const PRISM_EASE = {
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Decelerating. For anything entering — it should arrive, not land. */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/**
 * How long a list should take to play in, however long the list is.
 *
 * Per-item delay times item count grows without bound, so a 40-row board would
 * still be animating seconds after the user started reading it. This spreads a
 * fixed budget across the items instead, and caps how many move at all.
 */
export function staggerStep(count: number, budgetMs = 240): number {
  if (count <= 1) return 0;
  return Math.min(budgetMs / count, 60);
}

/**
 * Whether the user asked for less motion.
 *
 * Returns false when there is no `window`, which is the right answer during
 * SSR: the server cannot know, and the client corrects it on hydration.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Duration to actually use, honouring the reduced-motion preference. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRISM_DURATION,
  PRISM_EASE,
  motionDuration,
  prefersReducedMotion,
  staggerStep,
} from "./motion.js";

const tokens = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

function cssValue(name: string): string {
  const match = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(tokens);
  return (match?.[1] ?? "").trim();
}

describe("motion tokens", () => {
  it("agrees with tokens.css on every duration", () => {
    // The values exist in both CSS and TS because JS cannot read a custom
    // property before paint without forcing layout. Two copies that can
    // disagree is the cost; this test is the thing that stops them.
    expect(cssValue("--prism-dur-1")).toBe(`${PRISM_DURATION.instant}ms`);
    expect(cssValue("--prism-dur-2")).toBe(`${PRISM_DURATION.quick}ms`);
    expect(cssValue("--prism-dur-3")).toBe(`${PRISM_DURATION.settle}ms`);
    expect(cssValue("--prism-dur-4")).toBe(`${PRISM_DURATION.view}ms`);
  });

  it("agrees with tokens.css on every easing", () => {
    expect(cssValue("--prism-ease")).toBe(PRISM_EASE.standard);
    expect(cssValue("--prism-ease-out")).toBe(PRISM_EASE.out);
    expect(cssValue("--prism-ease-in-out")).toBe(PRISM_EASE.inOut);
  });

  it("keeps reduced motion zeroing every duration in CSS", () => {
    const block = tokens.slice(tokens.indexOf("prefers-reduced-motion"));
    for (const n of [1, 2, 3, 4]) {
      expect(block).toContain(`--prism-dur-${n}: 0ms`);
    }
  });
});

describe("staggerStep", () => {
  it("spends a fixed budget rather than a per-item delay", () => {
    // Per-item delay times item count is unbounded: a 40-row board would still
    // be animating well after the user started reading it.
    expect(staggerStep(40) * 40).toBeLessThanOrEqual(240);
    expect(staggerStep(100) * 100).toBeLessThanOrEqual(240);
  });

  it("does not stagger a list of one", () => {
    expect(staggerStep(1)).toBe(0);
    expect(staggerStep(0)).toBe(0);
  });

  it("caps the step so a short list still feels deliberate", () => {
    expect(staggerStep(2)).toBeLessThanOrEqual(60);
  });
});

describe("reduced motion", () => {
  it("answers false when there is no window, rather than throwing", () => {
    // SSR. The server cannot know, and the client corrects it on hydration.
    expect(prefersReducedMotion()).toBe(false);
    expect(motionDuration(PRISM_DURATION.view)).toBe(PRISM_DURATION.view);
  });
});

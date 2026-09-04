"use client";

import { useEffect, useState } from "react";
import { onReducedMotionChange, prefersReducedMotion } from "@/lib/gsap";

/**
 * Live reduced-motion state.
 *
 * Reads `false` on the server and on first client render so hydration matches,
 * then corrects in an effect. Chrome that lives for the whole session should
 * use this rather than reading the query once, so toggling the OS setting takes
 * effect immediately instead of at the next reload.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
    return onReducedMotionChange(setReduced);
  }, []);

  return reduced;
}

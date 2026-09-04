"use client";

import { useEffect } from "react";
import { CustomCursor } from "@/components/motion/CustomCursor";
import { RouteLoader } from "@/components/motion/RouteLoader";
import { installHashScroll } from "@/components/motion/hash-scroll";

/**
 * Global website chrome: the cursor, the route loader, and hash scrolling.
 *
 * One mount point in the root layout so these exist exactly once. Three
 * separate mounts would eventually become two cursors on some route, and this
 * is also the boundary that keeps them out of the IDE — the webview renders
 * `@repo-prism/app-shell`, never this tree, so none of it can leak into an
 * editor panel where a custom cursor would be actively wrong.
 */
export function MotionChrome() {
  useEffect(() => installHashScroll(), []);

  return (
    <>
      <RouteLoader />
      <CustomCursor />
    </>
  );
}

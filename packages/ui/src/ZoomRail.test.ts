import type { MapZoomLevel } from "@prism/shared";
import { describe, expect, it } from "vitest";
import { zoomKeyTarget } from "./ZoomRail.js";

const LEVELS: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "feature",
  "file",
  "symbol",
];

describe("zoomKeyTarget", () => {
  it("climbs and descends with brackets / arrows", () => {
    expect(zoomKeyTarget(LEVELS, "feature", "[")).toBe("package");
    expect(zoomKeyTarget(LEVELS, "feature", "ArrowLeft")).toBe("package");
    expect(zoomKeyTarget(LEVELS, "feature", "]")).toBe("file");
    expect(zoomKeyTarget(LEVELS, "feature", "ArrowRight")).toBe("file");
  });

  it("clamps at the ends", () => {
    expect(zoomKeyTarget(LEVELS, "repo", "[")).toBeNull();
    expect(zoomKeyTarget(LEVELS, "symbol", "]")).toBeNull();
  });

  it("jumps with number keys", () => {
    expect(zoomKeyTarget(LEVELS, "repo", "1")).toBe("repo");
    expect(zoomKeyTarget(LEVELS, "repo", "3")).toBe("feature");
    expect(zoomKeyTarget(LEVELS, "repo", "5")).toBe("symbol");
    expect(zoomKeyTarget(LEVELS, "repo", "9")).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(zoomKeyTarget(LEVELS, "feature", "a")).toBeNull();
    expect(zoomKeyTarget(LEVELS, "feature", "Enter")).toBeNull();
  });
});

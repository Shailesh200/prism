import type { MapZoomLevel, RepositoryMap } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { mapEmptyState } from "./map-empty.js";

function mapWith(zoom: MapZoomLevel, nodeCount: number): RepositoryMap {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    kind: "file",
    label: `n${i}`,
    data: {},
  }));
  return {
    zoom,
    graph: { nodes, edges: [] },
  } as unknown as RepositoryMap;
}

describe("mapEmptyState", () => {
  it("says nothing when there is something to draw", () => {
    expect(mapEmptyState(mapWith("feature", 3))).toBeNull();
  });

  it("explains an empty feature zoom in terms of how features are inferred", () => {
    const state = mapEmptyState(mapWith("feature", 0));
    expect(state?.title).toBe("No features inferred");
    // The mechanism matters more than the apology: a user who reads this can
    // look at their own directory layout and decide whether it is correct.
    expect(state?.detail).toMatch(/directory structure/i);
  });

  it("offers a way out of a zoom that has nothing, without promising it has something", () => {
    const state = mapEmptyState(mapWith("feature", 0));
    expect(state?.suggestZoom).toBe("file");
    expect(state?.suggestLabel).toBeTruthy();
  });

  it("does not suggest another zoom when the file graph itself is empty", () => {
    // Nothing parsed, so no finer or coarser zoom can help. Sending the user
    // somewhere equally blank would be worse than admitting the dead end.
    const state = mapEmptyState(mapWith("file", 0));
    expect(state?.suggestZoom).toBeUndefined();
    expect(state?.detail).toMatch(/TypeScript and JavaScript/);
  });

  it("covers every zoom level, so no zoom can render blank and unexplained", () => {
    const levels: MapZoomLevel[] = [
      "repo",
      "package",
      "feature",
      "file",
      "symbol",
    ];
    for (const level of levels) {
      const state = mapEmptyState(mapWith(level, 0));
      expect(state, level).not.toBeNull();
      expect(state?.title.length, level).toBeGreaterThan(0);
      expect(state?.detail.length, level).toBeGreaterThan(20);
    }
  });

  it("never suggests the zoom the user is already looking at", () => {
    const levels: MapZoomLevel[] = [
      "repo",
      "package",
      "feature",
      "file",
      "symbol",
    ];
    for (const level of levels) {
      expect(mapEmptyState(mapWith(level, 0))?.suggestZoom, level).not.toBe(
        level,
      );
    }
  });
});

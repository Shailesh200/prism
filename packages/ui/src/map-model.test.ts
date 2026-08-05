import { describe, expect, it } from "vitest";
import { filterSearchHits, UI_ZOOM_LEVELS } from "./map-model.js";

describe("@repo-prism/ui map helpers", () => {
  it("filters search hits and requires a query", () => {
    const all = [
      { id: "1", label: "Checkout", kind: "feature" as const },
      { id: "2", label: "Auth", kind: "feature" as const },
    ];
    expect(filterSearchHits(all, "")).toHaveLength(0);
    const hits = filterSearchHits(all, "check");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toBe("Checkout");
    expect(UI_ZOOM_LEVELS[0]).toBe("repo");
  });
});

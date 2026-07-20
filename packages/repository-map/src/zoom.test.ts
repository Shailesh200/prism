import { describe, expect, it } from "vitest";
import { MAP_ZOOM_LEVELS, zoomIn, zoomOut } from "./zoom.js";

describe("map zoom transforms (M-017)", () => {
  it("zooms in and out along the taxonomy", () => {
    expect(zoomIn("repo")).toBe("package");
    expect(zoomIn("package")).toBe("feature");
    expect(zoomIn("feature")).toBe("file");
    expect(zoomIn("file")).toBe("symbol");
    expect(zoomIn("symbol")).toBe("symbol");

    expect(zoomOut("symbol")).toBe("file");
    expect(zoomOut("file")).toBe("feature");
    expect(zoomOut("feature")).toBe("package");
    expect(zoomOut("package")).toBe("repo");
    expect(zoomOut("repo")).toBe("repo");
  });

  it("lists five zoom levels in order", () => {
    expect(MAP_ZOOM_LEVELS).toEqual([
      "repo",
      "package",
      "feature",
      "file",
      "symbol",
    ]);
  });
});

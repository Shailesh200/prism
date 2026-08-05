import { describe, expect, it } from "vitest";
import { FEATURE_LENS_ZOOM, PACKAGE_NAME, UI_ZOOM_LEVELS } from "./index.js";

describe("@repo-prism/ui", () => {
  it("exports package name and structural zoom rail (Feature is a lens)", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/ui");
    expect(UI_ZOOM_LEVELS).toEqual(["repo", "package", "file", "symbol"]);
    // Feature is a lens/overlay, not a rail altitude (ADR-0013).
    expect(UI_ZOOM_LEVELS).not.toContain("feature");
    expect(FEATURE_LENS_ZOOM).toBe("feature");
  });
});

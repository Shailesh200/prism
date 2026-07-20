import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, UI_ZOOM_LEVELS } from "./index.js";

describe("@prism/ui", () => {
  it("exports package name and zoom rail", () => {
    expect(PACKAGE_NAME).toBe("@prism/ui");
    expect(UI_ZOOM_LEVELS).toContain("feature");
  });
});

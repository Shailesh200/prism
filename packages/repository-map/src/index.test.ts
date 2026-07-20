import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, zoomIn, listMapLayerDescriptors } from "./index.js";

describe("@prism/repository-map", () => {
  it("exports package name and catalog helpers", () => {
    expect(PACKAGE_NAME).toBe("@prism/repository-map");
    expect(zoomIn("repo")).toBe("package");
    expect(listMapLayerDescriptors()).toHaveLength(8);
  });
});

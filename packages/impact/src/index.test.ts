import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@repo-prism/impact", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/impact");
  });
});

import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/core", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/core");
  });
});

import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/cursor-extension", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/cursor-extension");
  });
});

import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/ui", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/ui");
  });
});

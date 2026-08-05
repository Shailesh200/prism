import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@repo-prism/cli", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/cli");
  });
});

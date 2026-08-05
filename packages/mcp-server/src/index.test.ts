import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@repo-prism/mcp-server", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/mcp-server");
  });
});

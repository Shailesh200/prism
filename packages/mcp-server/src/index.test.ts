import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/mcp-server", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/mcp-server");
  });
});

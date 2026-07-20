import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@prism/graph-engine", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/graph-engine");
  });
});

import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, fileNodeId, findPaths } from "./index.js";

describe("@repo-prism/navigation", () => {
  it("exports package name and path helpers", () => {
    expect(PACKAGE_NAME).toBe("@repo-prism/navigation");
    expect(fileNodeId("src/a.ts")).toBe("file:src/a.ts");
    expect(
      findPaths({ id: "g", nodes: [], edges: [] }, "file:a.ts", "file:b.ts")
        .empty,
    ).toBe(true);
  });
});

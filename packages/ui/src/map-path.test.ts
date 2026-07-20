import { describe, expect, it } from "vitest";
import { isPathKind, splitRepoPath } from "./map-path.js";

describe("map-path", () => {
  it("splits repo paths", () => {
    expect(splitRepoPath("src/features/dashboard/Dashboard.ts")).toEqual({
      dir: "src/features/dashboard/",
      name: "Dashboard.ts",
    });
    expect(splitRepoPath("README.md")).toEqual({
      dir: null,
      name: "README.md",
    });
  });

  it("detects path-like kinds", () => {
    expect(isPathKind("file")).toBe(true);
    expect(isPathKind("feature")).toBe(false);
  });
});

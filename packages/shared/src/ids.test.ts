import { describe, expect, it } from "vitest";
import {
  asEdgeId,
  asFeatureId,
  asFileId,
  asNodeId,
  asRepoId,
  asSymbolId,
  unsafeEdgeId,
  unsafeFeatureId,
  unsafeFileId,
  unsafeNodeId,
  unsafeRepoId,
  unsafeSymbolId,
} from "./ids.js";
import { isOk } from "./result.js";

describe("IDs", () => {
  it("accepts valid ids", () => {
    expect(isOk(asRepoId("repo:local"))).toBe(true);
    expect(isOk(asFileId("file:src/a.ts"))).toBe(true);
    expect(isOk(asSymbolId("sym:foo"))).toBe(true);
    expect(isOk(asNodeId("node:1"))).toBe(true);
    expect(isOk(asEdgeId("edge:1"))).toBe(true);
    expect(isOk(asFeatureId("feat:billing"))).toBe(true);
  });

  it("rejects empty / illegal", () => {
    expect(asRepoId("").ok).toBe(false);
    expect(asFileId(" bad").ok).toBe(false);
    expect(asSymbolId("a b").ok).toBe(false);
  });

  it("unsafe casts", () => {
    expect(unsafeRepoId("x")).toBe("x");
    expect(unsafeFileId("x")).toBe("x");
    expect(unsafeSymbolId("x")).toBe("x");
    expect(unsafeNodeId("x")).toBe("x");
    expect(unsafeEdgeId("x")).toBe("x");
    expect(unsafeFeatureId("x")).toBe("x");
  });
});

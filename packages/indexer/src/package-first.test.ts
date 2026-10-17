import { describe, expect, it } from "vitest";
import type { FileInventoryEntry } from "@repo-prism/shared";
import { prioritizePackageFirst } from "./package-first.js";

function entry(path: string): FileInventoryEntry {
  return {
    path,
    sizeBytes: 10,
    mtimeMs: 0,
    hashAlgo: "sha256",
    contentHash: `h-${path}`,
    status: "hashed",
  };
}

const isCode = (e: FileInventoryEntry) => e.path.endsWith(".ts");

describe("prioritizePackageFirst (P19 ONB-4)", () => {
  it("visits shallow package roots before deeper ones", () => {
    const entries = [
      entry("apps/web/deep/leaf.ts"),
      entry("packages/core/index.ts"),
      entry("package.json"),
      entry("packages/core/package.json"),
      entry("apps/web/package.json"),
      entry("README.md"),
      entry("apps/web/page.ts"),
    ];
    const kept = prioritizePackageFirst(entries, 4).map((e) => e.path);
    // Root package first (package.json, README.md), then apps/web (alpha before packages/core).
    expect(kept).toEqual([
      "README.md",
      "package.json",
      "apps/web/deep/leaf.ts",
      "apps/web/package.json",
    ]);
  });

  it("counts only code files toward the cap and keeps the rest", () => {
    const entries = [
      entry("package.json"),
      entry("README.md"),
      entry("a.ts"),
      entry("b.ts"),
      entry("c.ts"),
    ];
    const kept = prioritizePackageFirst(entries, 2, isCode).map((e) => e.path);
    expect(kept).toEqual(["README.md", "a.ts", "b.ts", "package.json"]);
  });

  it("returns a copy when under the cap", () => {
    const entries = [entry("a.ts"), entry("b.ts")];
    const kept = prioritizePackageFirst(entries, 10);
    expect(kept).toEqual(entries);
    expect(kept).not.toBe(entries);
  });
});

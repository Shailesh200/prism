import { describe, expect, it } from "vitest";
import { rewriteMemoryAnchors } from "./memory-anchors.js";

describe("rewriteMemoryAnchors (M-075 M1)", () => {
  it("rewrites a symbol-anchored memory and leaves others alone", () => {
    const items = [
      { text: "keep fetchUser cache-free", symbol: "fetchUser" },
      { text: "other", symbol: "lruCache" },
      { text: "unanchored" },
    ];
    const next = rewriteMemoryAnchors(items, {
      kind: "symbol",
      from: "fetchUser",
      to: "loadUser",
    });
    expect(next[0]?.symbol).toBe("loadUser");
    expect(next[1]?.symbol).toBe("lruCache");
    expect(next[2]).toBe(items[2]);
  });

  it("rewrites a file path and children under a renamed directory", () => {
    const items = [
      { text: "a", path: "src/users/fetchUser.ts" },
      { text: "b", path: "src/users/lruCache.ts" },
      { text: "c", path: "src/other/x.ts" },
    ];
    const next = rewriteMemoryAnchors(items, {
      kind: "file",
      from: "src/users",
      to: "src/accounts",
    });
    expect(next.map((i) => i.path)).toEqual([
      "src/accounts/fetchUser.ts",
      "src/accounts/lruCache.ts",
      "src/other/x.ts",
    ]);
  });

  it("is a no-op when from equals to", () => {
    const items = [{ text: "x", symbol: "a" }];
    expect(
      rewriteMemoryAnchors(items, { kind: "symbol", from: "a", to: "a" })[0],
    ).toBe(items[0]);
  });
});

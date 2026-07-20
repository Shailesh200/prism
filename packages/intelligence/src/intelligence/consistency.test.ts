import { describe, expect, it } from "vitest";
import { checkIntelligenceConsistency } from "./consistency.js";

describe("checkIntelligenceConsistency", () => {
  it("flags file nodes outside the index", () => {
    const result = checkIntelligenceConsistency(new Set(["src/a.ts"]), [
      {
        id: "dependency",
        graph: {
          id: "g",
          nodes: [
            {
              id: "file:src/a.ts",
              kind: "file",
              label: "src/a.ts",
              attrs: { path: "src/a.ts" },
            },
            {
              id: "file:missing.ts",
              kind: "file",
              label: "missing.ts",
              attrs: { path: "missing.ts" },
            },
          ],
          edges: [],
        },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "GRAPH_FILE_NOT_INDEXED",
        graph: "dependency",
        path: "missing.ts",
      }),
    ]);
  });

  it("passes when all file nodes are indexed", () => {
    const result = checkIntelligenceConsistency(new Set(["a.ts"]), [
      {
        id: "knowledge",
        graph: {
          id: "g",
          nodes: [
            {
              id: "file:a.ts",
              kind: "file",
              label: "a.ts",
              attrs: { path: "a.ts" },
            },
            {
              id: "symbol:a.ts:x:0",
              kind: "symbol",
              label: "x",
            },
          ],
          edges: [],
        },
      },
    ]);
    expect(result).toEqual({ ok: true, issues: [] });
  });
});

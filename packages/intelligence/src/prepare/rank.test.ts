import { describe, expect, it } from "vitest";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import { rankFiles, rankIndexFor, stem, wordTokens } from "./rank.js";

function snap(files: IndexedFile[]): IndexSnapshot {
  return {
    repoId: "repo:rank",
    rootPath: "/tmp/rank",
    indexedAt: "2026-10-14T00:00:00.000Z",
    files,
    stats: {
      filesTotal: files.length,
      filesIndexed: files.length,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  };
}
function f(path: string, symbols: string[] = []): IndexedFile {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols: symbols.map((name) => ({
      name,
      kind: "function",
      start: 0,
      end: 1,
      exported: true,
    })),
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
  };
}
const none = new Map<string, Set<string>>();

describe("Prepare ranking (plan §5.1, P§2)", () => {
  it("RANK-1 rare tokens beat common ones (IDF)", () => {
    // "middleware" is in every file; "cors" only in one.
    const s = snap([
      f("src/middleware/cors/index.ts", ["cors"]),
      f("src/middleware/etag/index.ts", ["etag"]),
      f("src/middleware/jwt/index.ts", ["jwt"]),
      f("src/middleware/logger/index.ts", ["logger"]),
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "add a maxAge option to the cors middleware",
      strong: new Set(),
      neighbors: none,
    });
    expect(ranked[0]?.path).toBe("src/middleware/cors/index.ts");
  });

  it("RANK-2 import distance outranks recency", () => {
    const s = snap([
      f("src/debounce.ts", ["debounce"]),
      f("src/throttle.ts", ["throttle"]),
      f("src/hot.ts", ["hot"]),
    ]);
    const neighbors = new Map([
      ["src/debounce.ts", new Set(["src/throttle.ts"])],
      ["src/throttle.ts", new Set(["src/debounce.ts"])],
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "fix debounce",
      strong: new Set(),
      neighbors,
      tieBreak: (p) => (p === "src/hot.ts" ? 1 : 0),
    });
    const order = ranked.map((r) => r.path);
    expect(order[0]).toBe("src/debounce.ts");
    expect(order).toContain("src/throttle.ts");
    expect(order).not.toContain("src/hot.ts");
  });

  it("RANK-3 tests, declarations and off-limits files are never ranked", () => {
    const s = snap([
      f("src/date.ts", ["formatDate"]),
      f("src/date.test.ts", ["formatDate"]),
      f("src/date.d.ts", ["formatDate"]),
      f("src/generated/date.ts", ["formatDate"]),
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "formatDate is wrong",
      strong: new Set(),
      neighbors: none,
    });
    expect(ranked.map((r) => r.path)).toEqual(["src/date.ts"]);
  });

  it("RANK-4 a named file outranks lexical matches", () => {
    const s = snap([
      f("src/a.ts", ["parse"]),
      f("src/b.ts", ["parse", "body"]),
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "parse body",
      strong: new Set(["src/a.ts"]),
      neighbors: none,
    });
    expect(ranked[0]?.path).toBe("src/a.ts");
  });

  it("RANK-5 function words never seed", () => {
    const s = snap([f("src/when.ts", ["when"]), f("src/date.ts", ["dueDate"])]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "when is the due date",
      strong: new Set(),
      neighbors: none,
    });
    expect(ranked[0]?.path).toBe("src/date.ts");
  });

  it("tokenizer and stem", () => {
    expect(wordTokens("getNextRentDueDate")).toEqual([
      "get",
      "next",
      "rent",
      "due",
      "date",
    ]);
    expect(stem("headers")).toBe("header");
    expect(stem("matching")).toBe("match");
    expect(
      rankIndexFor(snap([f("src/cors/index.ts")]))
        .docs.get("src/cors/index.ts")
        ?.weights.get(stem("cors")),
    ).toBe(1);
  });
});

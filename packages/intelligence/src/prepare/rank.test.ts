import { describe, expect, it } from "vitest";
import type { IndexSnapshot, IndexedFile } from "@repo-prism/shared";
import {
  rankFiles,
  rankIndexFor,
  stem,
  taskAreas,
  wordTokens,
} from "./rank.js";

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

  it("CC-5 a file that co-changes with a seed joins the pack, ranked by Jaccard", () => {
    const s = snap([
      f("src/price.ts", ["price"]),
      f("src/tax.ts", ["tax"]),
      f("src/label.ts", ["label"]),
      f("src/other.ts", ["other"]),
    ]);
    const partners = new Map([
      [
        "src/price.ts",
        [
          { path: "src/tax.ts", together: 6, jaccard: 0.8 },
          { path: "src/label.ts", together: 2, jaccard: 0.3 },
          // Too weak to clear the score floor on its own.
          { path: "src/other.ts", together: 2, jaccard: 0.2 },
          { path: "src/price.test.ts", together: 5, jaccard: 0.7 },
        ],
      ],
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "change the price",
      strong: new Set(),
      neighbors: none,
      coChange: (p) => partners.get(p) ?? [],
    });
    expect(ranked.map((r) => r.path)).toEqual([
      "src/price.ts",
      "src/tax.ts",
      "src/label.ts",
    ]);
    expect(ranked[1]?.why).toEqual(["changed with src/price.ts in 6 commits"]);
    expect(ranked[1]?.provenance).toBe("measured");
  });

  it("CC-6 co-change never outranks an import neighbour it ties with", () => {
    const s = snap([
      f("src/price.ts", ["price"]),
      f("src/tax.ts", ["tax"]),
      f("src/util.ts", ["util"]),
    ]);
    const { ranked } = rankFiles({
      snapshot: s,
      task: "change the price",
      strong: new Set(),
      neighbors: new Map([
        ["src/price.ts", new Set(["src/util.ts"])],
        ["src/util.ts", new Set(["src/price.ts"])],
      ]),
      coChange: (p) =>
        p === "src/price.ts"
          ? [{ path: "src/tax.ts", together: 2, jaccard: 0.5 }]
          : [],
    });
    expect(ranked.map((r) => r.path)).toEqual([
      "src/price.ts",
      "src/util.ts",
      "src/tax.ts",
    ]);
  });
});

describe("P6 feedback ranking", () => {
  it("FB-3 feedback raises a repeatedly-edited file", () => {
    const snapshot = snap([
      f("src/hot.ts", ["hot"]),
      f("src/cold.ts", ["cold"]),
    ]);
    const base = rankFiles({
      snapshot,
      task: "touch unrelated",
      strong: new Set(),
      neighbors: new Map(),
    });
    const withFb = rankFiles({
      snapshot,
      task: "touch unrelated",
      strong: new Set(),
      neighbors: new Map(),
      feedback: (path) => (path === "src/hot.ts" ? 1 : 0),
    });
    const baseHot =
      base.ranked.find((r) => r.path === "src/hot.ts")?.score ?? 0;
    const fbHot =
      withFb.ranked.find((r) => r.path === "src/hot.ts")?.score ?? 0;
    expect(fbHot).toBeGreaterThan(baseHot);
    expect(withFb.ranked.find((r) => r.path === "src/hot.ts")?.why).toContain(
      "edited for similar tasks before",
    );
  });

  it("FB-4 feedback weight cannot dominate a strong name", () => {
    const snapshot = snap([
      f("src/named.ts", ["named"]),
      f("src/fb.ts", ["fb"]),
    ]);
    const ranked = rankFiles({
      snapshot,
      task: "named",
      strong: new Set(["src/named.ts"]),
      neighbors: new Map(),
      feedback: (path) => (path === "src/fb.ts" ? 1 : 0),
    });
    expect(ranked.ranked[0]?.path).toBe("src/named.ts");
  });
});

describe("P9 confidence and why", () => {
  it("WHY-2 / CONF-1 measured import neighbour is high with a reason", () => {
    const snapshot = snap([f("src/a.ts", ["a"]), f("src/b.ts", ["b"])]);
    const neighbors = new Map<string, Set<string>>([
      ["src/a.ts", new Set(["src/b.ts"])],
      ["src/b.ts", new Set(["src/a.ts"])],
    ]);
    const { ranked } = rankFiles({
      snapshot,
      task: "a",
      strong: new Set(["src/a.ts"]),
      neighbors,
    });
    const a = ranked.find((r) => r.path === "src/a.ts");
    expect(a?.why.length).toBeGreaterThan(0);
    expect(a?.why.length).toBeLessThanOrEqual(2);
    expect(a?.confidence).toBe("high");
  });

  it("CONF-1 heuristic-only pick is medium", () => {
    const snapshot = snap([f("src/only.ts", ["zzz"])]);
    const { ranked } = rankFiles({
      snapshot,
      task: "completely unrelated query qwerty",
      strong: new Set(),
      neighbors: none,
      feedback: (path) => (path === "src/only.ts" ? 0.9 : 0),
    });
    const hit = ranked.find((r) => r.path === "src/only.ts");
    expect(hit?.provenance).toBe("heuristic");
    expect(hit?.confidence).toBe("medium");
    expect(hit?.why).toContain("edited for similar tasks before");
  });

  it("WHY-1 every ranked item has a non-empty why", () => {
    const snapshot = snap([
      f("src/a.ts", ["fetchUser"]),
      f("src/b.ts", ["cache"]),
    ]);
    const neighbors = new Map<string, Set<string>>([
      ["src/a.ts", new Set(["src/b.ts"])],
      ["src/b.ts", new Set(["src/a.ts"])],
    ]);
    const { ranked } = rankFiles({
      snapshot,
      task: "fetchUser cache",
      strong: new Set(["src/a.ts"]),
      neighbors,
    });
    expect(ranked.length).toBeGreaterThan(0);
    for (const row of ranked) {
      expect(row.why.length).toBeGreaterThan(0);
      expect(row.why.every((w) => w.trim().length > 0)).toBe(true);
    }
  });

  it("CONF-2 unresolved import → medium with reason", () => {
    const snapshot = snap([f("src/a.ts", ["a"]), f("src/b.ts", ["b"])]);
    const { ranked } = rankFiles({
      snapshot,
      task: "a",
      strong: new Set(["src/a.ts"]),
      neighbors: none,
      unresolvedFrom: new Set(["src/a.ts"]),
    });
    const hit = ranked.find((r) => r.path === "src/a.ts");
    expect(hit?.why).toContain("unresolved import");
    expect(hit?.confidence).toBe("medium");
  });

  it("CONF-4 a seed far below the best match is not sure (round 4)", () => {
    const snapshot = snap([
      f("src/recs/recommendationCardLimit.ts", ["recommendationCardLimit"]),
      f("src/cards/addCard.ts", ["addCard"]),
      f("src/other/x.ts", ["x"]),
      f("src/other/y.ts", ["y"]),
    ]);
    const { ranked } = rankFiles({
      snapshot,
      task: "add recommendation limit card",
      strong: new Set(),
      neighbors: none,
    });
    const top = ranked.find(
      (r) => r.path === "src/recs/recommendationCardLimit.ts",
    );
    const weak = ranked.find((r) => r.path === "src/cards/addCard.ts");
    expect(top?.confidence).toBe("high");
    expect(weak?.why).toContain("seed file");
    expect(weak?.confidence).toBe("medium");
  });

  it("CONF-3 stale index → low", () => {
    const snapshot = snap([f("src/a.ts", ["a"])]);
    const neighbors = new Map<string, Set<string>>([["src/a.ts", new Set()]]);
    const { ranked } = rankFiles({
      snapshot,
      task: "a",
      strong: new Set(["src/a.ts"]),
      neighbors,
      indexStale: true,
    });
    const hit = ranked.find((r) => r.path === "src/a.ts");
    expect(hit?.why).toContain("stale index");
    expect(hit?.confidence).toBe("low");
  });
});

describe("monorepo areas (website round)", () => {
  const s = snap([
    f("package.json"),
    f("apps/website/package.json"),
    f("apps/website/components/site/hero.tsx", ["Hero"]),
    f("apps/website/app/page.tsx", ["HomePage"]),
    f("packages/checks/package.json"),
    f("packages/checks/src/run.ts", ["runChecks"]),
    f("packages/shared/package.json"),
    f("packages/shared/src/index.ts", ["rewriteHero", "statLine", "heroStats"]),
    f("packages/shared/fixtures/demo/package.json"),
  ]);

  it("a task naming a package matches files inside it, not a look-alike barrel", () => {
    const { ranked } = rankFiles({
      snapshot: s,
      task: "Rewrite the website home page hero and stats",
      strong: new Set(),
      neighbors: none,
    });
    expect(
      ranked
        .slice(0, 2)
        .map((r) => r.path)
        .sort(),
    ).toEqual([
      "apps/website/app/page.tsx",
      "apps/website/components/site/hero.tsx",
    ]);
    expect(ranked.map((r) => r.path)).not.toContain(
      "packages/shared/src/index.ts",
    );
  });

  it("names areas by whole words, top-level packages only", () => {
    expect(taskAreas(s, "fix the website hero")).toEqual(["apps/website"]);
    expect(taskAreas(s, "check links on every page")).toEqual([]);
    expect(taskAreas(s, "the demo fixture")).toEqual([]);
    expect(taskAreas(s, "rewrite hero stats")).toEqual([]);
  });

  it("no area named: ranking is unchanged", () => {
    const { ranked } = rankFiles({
      snapshot: s,
      task: "rewrite hero stats",
      strong: new Set(),
      neighbors: none,
    });
    expect(ranked[0]?.path).toBe("packages/shared/src/index.ts");
  });
});

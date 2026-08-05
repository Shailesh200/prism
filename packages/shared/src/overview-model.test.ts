import { describe, expect, it } from "vitest";
import type { RepositoryMap } from "./schemas.js";
import {
  bucketActivity,
  couplingBand,
  couplingDensity,
  couplingFor,
  deriveMostConnected,
  deriveRegions,
  floorToUtcDay,
  parseDayMs,
  presetBounds,
} from "./overview-model.js";

type MapGraph = RepositoryMap["graph"];
type MapNode = MapGraph["nodes"][number];

/**
 * Characterisation tests for the Overview derivations moved out of
 * `@prism/app-shell` in M-052. The expectations describe today's behaviour,
 * including the parts that look odd, so the move can be proven rather than
 * asserted.
 */

function node(
  id: string,
  kind: string,
  label = id,
  attrs?: Record<string, unknown>,
): MapNode {
  return { id, kind, label, ...(attrs ? { attrs } : {}) } as MapNode;
}

function graphOf(
  nodes: MapNode[],
  edges: Array<{ from: string; to: string }> = [],
): MapGraph {
  return {
    nodes,
    edges: edges.map((e, i) => ({ id: `e${i}`, kind: "import", ...e })),
  } as unknown as MapGraph;
}

describe("couplingDensity", () => {
  it("is edges over nodes", () => {
    const graph = graphOf(
      [node("a", "file"), node("b", "file"), node("c", "file")],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
      ],
    );
    expect(couplingDensity(graph)).toBe(1);
  });

  it("is zero rather than NaN for an empty graph", () => {
    expect(couplingDensity(graphOf([]))).toBe(0);
    expect(Number.isNaN(couplingDensity(graphOf([])))).toBe(false);
  });
});

describe("couplingBand", () => {
  it.each([
    [0, "low"],
    [0.49, "low"],
    [0.5, "medium"],
    [0.99, "medium"],
    [1, "high"],
    [12, "high"],
  ])("bands %s as %s", (density, band) => {
    expect(couplingBand(density)).toBe(band);
  });

  it("pairs the density with its band", () => {
    const graph = graphOf(
      [node("a", "file"), node("b", "file")],
      [{ from: "a", to: "b" }],
    );
    expect(couplingFor(graph)).toEqual({ density: 0.5, band: "medium" });
  });
});

describe("deriveRegions", () => {
  it("counts files from memberFiles first", () => {
    const graph = graphOf([
      node("feat:auth", "feature", "Auth", {
        memberFiles: ["a.ts", "b.ts"],
        fileCount: 99,
      }),
    ]);
    expect(deriveRegions(graph)[0]?.files).toBe(2);
  });

  it("falls back to fileCount, then files, then a path-prefix walk", () => {
    expect(
      deriveRegions(graphOf([node("p:x", "package", "x", { fileCount: 4 })]))[0]
        ?.files,
    ).toBe(4);

    expect(
      deriveRegions(graphOf([node("p:y", "package", "y", { files: 3 })]))[0]
        ?.files,
    ).toBe(3);

    const walked = graphOf([
      node("d:src", "folder", "src", { rootDir: "src" }),
      node("file:src/a.ts", "file"),
      node("file:src/nested/b.ts", "file"),
      node("file:other/c.ts", "file"),
    ]);
    expect(deriveRegions(walked)[0]?.files).toBe(2);
  });

  it("treats an empty rootDir as the whole repository", () => {
    const graph = graphOf([
      node("d:root", "folder", ".", { rootDir: "." }),
      node("file:a.ts", "file"),
      node("file:b.ts", "file"),
    ]);
    expect(deriveRegions(graph)[0]?.files).toBe(2);
  });

  it("scores nothing when a region has neither files nor edges", () => {
    // ADR-0029: no evidence means no number, not zero.
    const graph = graphOf([node("feat:empty", "feature", "Empty")]);
    expect(deriveRegions(graph)[0]?.score).toBeNull();
  });

  it("gives a mid score when the zoom level has no edges at all", () => {
    const graph = graphOf([
      node("feat:a", "feature", "A", { fileCount: 3 }),
      node("feat:b", "feature", "B", { fileCount: 5 }),
    ]);
    const regions = deriveRegions(graph);
    expect(regions.map((r) => r.score)).toEqual([70, 70]);
  });

  it("penalises the most coupled region hardest", () => {
    const graph = graphOf(
      [
        node("feat:hub", "feature", "Hub", { fileCount: 1 }),
        node("feat:leaf", "feature", "Leaf", { fileCount: 1 }),
        node("feat:mid", "feature", "Mid", { fileCount: 1 }),
      ],
      [
        { from: "feat:hub", to: "feat:leaf" },
        { from: "feat:hub", to: "feat:mid" },
        { from: "feat:hub", to: "feat:leaf" },
      ],
    );
    const byId = new Map(deriveRegions(graph).map((r) => [r.id, r]));
    const hub = byId.get("feat:hub");
    const leaf = byId.get("feat:leaf");
    expect(hub?.degree).toBe(3);
    expect(hub?.score).toBeLessThan(leaf?.score ?? 100);
    expect(hub?.score).toBe(45); // 100 - (3/3)*55
  });

  it("returns at most eight regions", () => {
    const graph = graphOf(
      Array.from({ length: 20 }, (_, i) =>
        node(`feat:${i}`, "feature", `F${i}`, { fileCount: 1 }),
      ),
    );
    expect(deriveRegions(graph)).toHaveLength(8);
  });

  it("ignores node kinds that are not regions", () => {
    const graph = graphOf([node("file:a.ts", "file"), node("sym:x", "symbol")]);
    expect(deriveRegions(graph)).toEqual([]);
  });
});

describe("deriveMostConnected", () => {
  it("ranks by degree, breaking ties by label", () => {
    const graph = graphOf(
      [
        node("file:a.ts", "file", "a.ts"),
        node("file:b.ts", "file", "b.ts"),
        node("file:c.ts", "file", "c.ts"),
      ],
      [
        { from: "file:a.ts", to: "file:b.ts" },
        { from: "file:a.ts", to: "file:c.ts" },
        { from: "file:b.ts", to: "file:c.ts" },
      ],
    );
    expect(deriveMostConnected(graph).map((n) => [n.label, n.degree])).toEqual([
      ["a.ts", 2],
      ["b.ts", 2],
      ["c.ts", 2],
    ]);
  });

  it("drops nodes with no edges", () => {
    const graph = graphOf(
      [
        node("file:a.ts", "file", "a.ts"),
        node("file:b.ts", "file", "b.ts"),
        node("file:lonely.ts", "file", "lonely.ts"),
      ],
      [{ from: "file:a.ts", to: "file:b.ts" }],
    );
    expect(deriveMostConnected(graph).map((n) => n.label)).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("honours the limit, including zero", () => {
    const graph = graphOf(
      [
        node("file:a.ts", "file", "a.ts"),
        node("file:b.ts", "file", "b.ts"),
        node("file:c.ts", "file", "c.ts"),
      ],
      [
        { from: "file:a.ts", to: "file:b.ts" },
        { from: "file:b.ts", to: "file:c.ts" },
      ],
    );
    expect(deriveMostConnected(graph, 1)).toHaveLength(1);
    expect(deriveMostConnected(graph, 0)).toHaveLength(0);
  });

  it("excludes symbol nodes", () => {
    const graph = graphOf(
      [node("sym:x", "symbol", "x"), node("sym:y", "symbol", "y")],
      [{ from: "sym:x", to: "sym:y" }],
    );
    expect(deriveMostConnected(graph)).toEqual([]);
  });
});

describe("activity windows", () => {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);

  it("floors to UTC midnight", () => {
    expect(floorToUtcDay(day("2026-08-05") + 3600_000)).toBe(day("2026-08-05"));
  });

  it("parses a day key and rejects nonsense", () => {
    expect(parseDayMs("2026-08-05")).toBe(day("2026-08-05"));
    expect(Number.isNaN(parseDayMs("not-a-date"))).toBe(true);
  });

  it("builds an inclusive window ending today", () => {
    const { startMs, endMs } = presetBounds(7, day("2026-08-05"));
    expect(endMs).toBe(day("2026-08-05"));
    expect(startMs).toBe(day("2026-07-30"));
  });

  it("zero-fills quiet days so gaps do not read as missing data", () => {
    const result = bucketActivity(
      [
        { date: "2026-08-01", commits: 2 },
        { date: "2026-08-03", commits: 5 },
      ],
      day("2026-08-01"),
      day("2026-08-04"),
    );
    expect(result.buckets).toEqual([2, 0, 5, 0]);
    expect(result.total).toBe(7);
    expect(result.granularity).toBe("day");
  });

  it("rolls up weekly once the window passes eight weeks", () => {
    const result = bucketActivity(
      [{ date: "2026-08-01", commits: 3 }],
      day("2026-01-01"),
      day("2026-08-05"),
    );
    expect(result.granularity).toBe("week");
    expect(result.total).toBe(3);
  });

  it("stays daily at exactly eight weeks", () => {
    const start = day("2026-06-11");
    const end = start + 55 * 86_400_000;
    expect(bucketActivity([], start, end).granularity).toBe("day");
    expect(bucketActivity([], start, end + 86_400_000).granularity).toBe(
      "week",
    );
  });

  it("ignores commits outside the window", () => {
    const result = bucketActivity(
      [
        { date: "2025-01-01", commits: 100 },
        { date: "2026-08-02", commits: 4 },
        { date: "2030-01-01", commits: 100 },
      ],
      day("2026-08-01"),
      day("2026-08-03"),
    );
    expect(result.total).toBe(4);
  });

  it("returns nothing for an inverted or unparseable window", () => {
    const inverted = bucketActivity([], day("2026-08-05"), day("2026-08-01"));
    expect(inverted).toEqual({
      buckets: [],
      starts: [],
      total: 0,
      granularity: "day",
    });
    expect(bucketActivity([], Number.NaN, Number.NaN).buckets).toEqual([]);
  });

  it("labels every bucket with its start", () => {
    const result = bucketActivity([], day("2026-08-01"), day("2026-08-03"));
    expect(result.starts).toEqual([
      day("2026-08-01"),
      day("2026-08-02"),
      day("2026-08-03"),
    ]);
  });
});

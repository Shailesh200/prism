import type { RepositoryMap } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  activityGeometry,
  bucketActivity,
  clampPct,
  couplingBadge,
  couplingDensity,
  deriveMostConnected,
  deriveRegions,
  domainDisplayName,
  parseDayMs,
  presetBounds,
  scoreColor,
} from "./overview-model.js";

type Graph = RepositoryMap["graph"];

function graph(
  nodes: ReadonlyArray<{
    id: string;
    kind: string;
    label: string;
    attrs?: Record<string, unknown>;
  }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
): Graph {
  return {
    id: "g",
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      ...(n.attrs ? { attrs: n.attrs as Graph["nodes"][number]["attrs"] } : {}),
    })),
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      kind: "depends_on",
      from: e.from,
      to: e.to,
    })),
  };
}

describe("clampPct", () => {
  it("rounds and clamps to 0..100", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(150)).toBe(100);
    expect(clampPct(42.4)).toBe(42);
    expect(clampPct(42.6)).toBe(43);
  });
});

describe("scoreColor", () => {
  it("maps score bands to semantic colors", () => {
    expect(scoreColor(95)).toBe("#10B981");
    expect(scoreColor(70)).toBe("#00C2C2");
    expect(scoreColor(50)).toBe("#F59E0B");
    expect(scoreColor(10)).toBe("#F43F5E");
  });
});

describe("couplingDensity + couplingBadge", () => {
  it("computes edges/nodes and returns 0 for an empty graph", () => {
    expect(couplingDensity(graph([], []))).toBe(0);
    const g = graph(
      [
        { id: "a", kind: "feature", label: "A" },
        { id: "b", kind: "feature", label: "B" },
      ],
      [{ from: "a", to: "b" }],
    );
    expect(couplingDensity(g)).toBeCloseTo(0.5);
  });

  it("labels density bands", () => {
    expect(couplingBadge(0.3)).toEqual({ label: "Low", tone: "emerald" });
    expect(couplingBadge(0.7)).toEqual({ label: "Medium", tone: "amber" });
    expect(couplingBadge(1.4)).toEqual({ label: "High", tone: "rose" });
  });
});

describe("deriveRegions", () => {
  it("keeps only container nodes, counts members and degree, caps at 8", () => {
    const nodes = [
      {
        id: "f1",
        kind: "feature",
        label: "Auth",
        attrs: { memberFiles: ["a.ts", "b.ts"] },
      },
      { id: "p1", kind: "package", label: "core" },
      { id: "s1", kind: "symbol", label: "fn" },
    ];
    const edges = [
      { from: "f1", to: "p1" },
      { from: "p1", to: "f1" },
    ];
    const regions = deriveRegions(graph(nodes, edges));
    expect(regions.map((r) => r.id)).toEqual(["f1", "p1"]);
    const auth = regions[0]!;
    expect(auth.files).toBe(2);
    expect(auth.degree).toBe(2);
    expect(auth.score).not.toBeNull();
    expect(auth.score!).toBeGreaterThanOrEqual(0);
    expect(auth.score!).toBeLessThanOrEqual(100);
    expect(auth.color).toMatch(/^#/);
  });

  it("uses fileCount / path-prefix fallbacks and omits empty zero-degree scores", () => {
    const regions = deriveRegions(
      graph(
        [
          {
            id: "pkg:a",
            kind: "package",
            label: "a",
            attrs: { fileCount: 4, rootDir: "apps/a" },
          },
          { id: "x", kind: "folder", label: "docs" },
        ],
        [],
      ),
    );
    expect(regions[0]!.files).toBe(4);
    expect(regions[0]!.score).toBe(70);
    expect(regions[1]!.files).toBe(0);
    expect(regions[1]!.score).toBeNull();
  });

  it("counts child file nodes by rootDir prefix when memberFiles is missing", () => {
    const regions = deriveRegions(
      graph(
        [
          {
            id: "pkg:web",
            kind: "package",
            label: "web",
            attrs: { rootDir: "apps/web" },
          },
          { id: "file:apps/web/a.ts", kind: "file", label: "a.ts" },
          { id: "file:apps/web/b.ts", kind: "file", label: "b.ts" },
          { id: "file:apps/api/c.ts", kind: "file", label: "c.ts" },
        ],
        [],
      ),
    );
    expect(regions[0]!.files).toBe(2);
    expect(regions[0]!.score).toBe(70);
  });
});

describe("domainDisplayName", () => {
  it("shortens devops_platform and title-cases other ids", () => {
    expect(domainDisplayName("devops_platform")).toBe("Devops");
    expect(domainDisplayName("frontend")).toBe("Frontend");
  });
});

describe("deriveMostConnected", () => {
  it("ranks file/feature/package nodes by degree", () => {
    const connected = deriveMostConnected(
      graph(
        [
          { id: "file:a.ts", kind: "file", label: "a.ts" },
          { id: "file:b.ts", kind: "file", label: "b.ts" },
          { id: "file:c.ts", kind: "file", label: "c.ts" },
          { id: "sym", kind: "symbol", label: "fn" },
        ],
        [
          { from: "file:a.ts", to: "file:b.ts" },
          { from: "file:a.ts", to: "file:c.ts" },
        ],
      ),
    );
    expect(connected.map((c) => c.id)).toEqual([
      "file:a.ts",
      "file:b.ts",
      "file:c.ts",
    ]);
    expect(connected[0]!.degree).toBe(2);
    expect(connected[1]!.degree).toBe(1);
  });
});

describe("activityGeometry", () => {
  it("sums totals and builds a closed area path", () => {
    const g = activityGeometry([0, 2, 4], 600, 180, 8);
    expect(g.total).toBe(6);
    // area starts and ends on the baseline (y = h - pad = 172)
    expect(g.area.startsWith("8,172 ")).toBe(true);
    expect(g.area.endsWith(",172")).toBe(true);
    // one point per week in the line
    expect(g.line.split(" ")).toHaveLength(3);
  });

  it("handles empty and single-week input without NaN", () => {
    expect(activityGeometry([]).total).toBe(0);
    const single = activityGeometry([5]);
    expect(single.total).toBe(5);
    expect(single.line.includes("NaN")).toBe(false);
  });
});

describe("presetBounds", () => {
  it("produces an inclusive N-day window ending at 'now' (UTC day)", () => {
    const now = Date.parse("2026-07-22T09:30:00Z");
    const { startMs, endMs } = presetBounds(30, now);
    expect(new Date(endMs).toISOString()).toBe("2026-07-22T00:00:00.000Z");
    // 30 days inclusive -> start is 29 days before end.
    const spanDays = Math.round((endMs - startMs) / 86_400_000) + 1;
    expect(spanDays).toBe(30);
  });

  it("supports a 1-year window", () => {
    const now = Date.parse("2026-07-22T00:00:00Z");
    const { startMs, endMs } = presetBounds(365, now);
    const spanDays = Math.round((endMs - startMs) / 86_400_000) + 1;
    expect(spanDays).toBe(365);
  });
});

describe("bucketActivity", () => {
  const days = [
    { date: "2026-07-01", commits: 2 },
    { date: "2026-07-02", commits: 3 },
    { date: "2026-07-20", commits: 5 },
    { date: "2026-09-30", commits: 9 }, // outside a July window
  ];

  it("keeps short windows daily and sums only in-range commits", () => {
    const start = parseDayMs("2026-07-01");
    const end = parseDayMs("2026-07-28");
    const { buckets, starts, total, granularity } = bucketActivity(
      days,
      start,
      end,
    );
    expect(granularity).toBe("day");
    expect(buckets).toHaveLength(28);
    expect(starts).toHaveLength(28);
    expect(starts[0]).toBe(parseDayMs("2026-07-01"));
    expect(starts[19]).toBe(parseDayMs("2026-07-20"));
    expect(total).toBe(10); // 2 + 3 + 5 (Sep excluded)
    expect(buckets[0]).toBe(2); // Jul 1
    expect(buckets[1]).toBe(3); // Jul 2
    expect(buckets[19]).toBe(5); // Jul 20
  });

  it("rolls long windows up to weekly buckets", () => {
    const start = parseDayMs("2026-04-01");
    const end = parseDayMs("2026-09-30");
    const { granularity, total } = bucketActivity(days, start, end);
    expect(granularity).toBe("week");
    expect(total).toBe(19); // all four days now in-range
  });

  it("returns empty buckets for an inverted range", () => {
    const { buckets, total } = bucketActivity(
      days,
      parseDayMs("2026-07-28"),
      parseDayMs("2026-07-01"),
    );
    expect(buckets).toHaveLength(0);
    expect(total).toBe(0);
  });
});

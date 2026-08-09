import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixturesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
);

const cyclesFixture = join(fixturesRoot, "m010-cycles");
const unresolvedFixture = join(fixturesRoot, "m056-unresolved");

describe("workspace dependency graph (M-010)", () => {
  it("requires an index before graph APIs", () => {
    const client = Prism.create();
    const opened = client.openRepository(cyclesFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const graph = opened.value.getDependencyGraph();
    expect(graph.ok).toBe(false);
    if (graph.ok) return;
    expect(graph.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("detects the intentional file cycle on the golden fixture", async () => {
    const client = Prism.create();
    const opened = client.openRepository(cyclesFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const graph = ws.getDependencyGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    expect(graph.value.nodes.map((n) => n.id).sort()).toEqual([
      "file:a.ts",
      "file:b.ts",
      "file:c.ts",
    ]);
    expect(
      graph.value.edges.map((e) => `${e.kind}:${e.from}->${e.to}`).sort(),
    ).toEqual([
      "import:file:a.ts->file:b.ts",
      "import:file:b.ts->file:c.ts",
      "import:file:c.ts->file:a.ts",
    ]);

    const cycles = ws.getCycles();
    expect(cycles.ok).toBe(true);
    if (!cycles.ok) return;
    expect(cycles.value).toEqual([["file:a.ts", "file:b.ts", "file:c.ts"]]);

    const pkg = ws.getDependencyGraph({ packageAggregation: true });
    expect(pkg.ok).toBe(true);
    if (!pkg.ok) return;
    expect(pkg.value.nodes.map((n) => n.id)).toEqual([
      "pkg:@prism-fixture/m010-cycles",
    ]);
    expect(ws.getCycles({ packageAggregation: true })).toEqual({
      ok: true,
      value: [],
    });
  });

  it("surfaces unresolvedImports count and sample (M-056 / P-A1)", async () => {
    const client = Prism.create();
    const opened = client.openRepository(unresolvedFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const graph = ws.getDependencyGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.value.unresolvedImports?.count).toBeGreaterThan(0);
    expect(graph.value.unresolvedImports?.sample.length).toBeGreaterThan(0);
    expect(graph.value.unresolvedImports?.sample[0]).toContain(
      "no-such-module",
    );

    const health = await ws.getHealth();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    const parse = health.value.factors.find((f) => f.id === "parse_health");
    expect(
      parse?.breakdown?.some(
        (b) =>
          b.label === "Unresolved imports" &&
          typeof b.value === "number" &&
          b.value > 0,
      ),
    ).toBe(true);
  });
});

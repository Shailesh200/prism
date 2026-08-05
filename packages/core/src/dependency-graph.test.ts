import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const cyclesFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m010-cycles",
);

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
});

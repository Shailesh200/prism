import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { Prism } from "./prism.js";

const refsFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m011-refs",
);

describe("workspace knowledge graph (M-011)", () => {
  it("requires an index before KG APIs", () => {
    const client = Prism.create();
    const opened = client.openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const kg = opened.value.getKnowledgeGraph();
    expect(kg.ok).toBe(false);
    if (kg.ok) return;
    expect(kg.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("findReferences returns the golden call site for add", async () => {
    const client = Prism.create();
    const opened = client.openRepository(refsFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const kg = ws.getKnowledgeGraph();
    expect(kg.ok).toBe(true);
    if (!kg.ok) return;
    expect(kg.value.stats.nodes).toBeGreaterThan(0);
    expect(kg.value.stats.edges).toBeGreaterThan(0);
    expect(kg.value.stats.nodesByKind.file).toBeGreaterThanOrEqual(3);
    expect(kg.value.stats.edgesByKind.defines).toBeGreaterThan(0);

    const syms = ws.findSymbol({ name: "add", path: "helper.ts" });
    expect(syms.ok).toBe(true);
    if (!syms.ok) return;
    expect(syms.value).toHaveLength(1);

    const refs = ws.findReferences({ name: "add", path: "helper.ts" });
    expect(refs.ok).toBe(true);
    if (!refs.ok) return;
    expect(
      refs.value.some((r) => r.path === "main.ts" && r.kind === "call"),
    ).toBe(true);
    const call = refs.value.find((r) => r.path === "main.ts");
    expect(call?.targetSymbolId).toBe(syms.value[0]?.id);
    expect(typeof call?.start).toBe("number");
    expect(typeof call?.end).toBe("number");

    const testsEdge = kg.value.graph.edges.find(
      (e) =>
        e.kind === "tests" &&
        e.from === "file:main.test.ts" &&
        e.to === "file:main.ts",
    );
    expect(testsEdge).toBeDefined();

    const extendsEdge = kg.value.graph.edges.find((e) => e.kind === "extends");
    expect(extendsEdge).toBeDefined();
  });
});

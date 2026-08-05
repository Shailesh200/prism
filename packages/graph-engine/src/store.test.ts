import { describe, expect, it } from "vitest";
import { PrismErrorCode, type GraphSnapshotDto } from "@repo-prism/shared";
import { createGraphStore, graphStoreFromJSON } from "./store.js";
import { layoutGraph } from "./layout.js";

const fixture: GraphSnapshotDto = {
  id: "fixture-dep",
  nodes: [
    { id: "a", kind: "file", label: "a.ts" },
    { id: "b", kind: "file", label: "b.ts" },
    { id: "c", kind: "file", label: "c.ts" },
  ],
  edges: [
    { id: "e1", kind: "imports", from: "a", to: "b" },
    { id: "e2", kind: "imports", from: "b", to: "c" },
    { id: "e3", kind: "calls", from: "a", to: "c" },
  ],
};

describe("createGraphStore", () => {
  it("loads fixture and answers neighbors / degree / path", () => {
    const store = createGraphStore({ id: "fixture-dep" });
    expect(store.bulkLoad(fixture).ok).toBe(true);

    expect(store.neighbors("a", { direction: "out" })).toEqual(["b", "c"]);
    expect(store.neighbors("b", { direction: "in" })).toEqual(["a"]);
    expect(store.degree("a", { direction: "out" })).toBe(2);
    expect(store.degree("a", { kind: "imports" })).toBe(1);

    const path = store.shortestPath("a", "c");
    expect(path.ok).toBe(true);
    if (!path.ok) return;
    expect(path.value[0]).toBe("a");
    expect(path.value.at(-1)).toBe("c");
    // Direct a→c edge exists; shortest path has length 2.
    expect(path.value).toEqual(["a", "c"]);
  });

  it("serializes deterministically for golden fixtures", () => {
    const store = createGraphStore({ id: "fixture-dep" });
    store.bulkLoad(fixture);
    const json = store.toJSON();
    expect(json.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(json.edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);

    const again = graphStoreFromJSON(json);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.toJSON()).toEqual(json);
  });

  it("builds subgraph and supports CRUD", () => {
    const store = createGraphStore();
    store.bulkLoad(fixture);
    const sub = store.subgraph(["a", "b"]);
    expect(sub.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(sub.edges.map((e) => e.id)).toEqual(["e1"]);

    expect(store.removeEdge("e3").ok).toBe(true);
    expect(store.getEdge("e3")).toBeUndefined();
    expect(store.addNode({ id: "d", kind: "file", label: "d.ts" }).ok).toBe(
      true,
    );
    expect(
      store.addEdge({ id: "e4", kind: "imports", from: "c", to: "d" }).ok,
    ).toBe(true);
    expect(store.removeNode("d").ok).toBe(true);
    expect(store.getNode("d")).toBeUndefined();
  });

  it("returns GRAPH_ERROR when path is missing", () => {
    const store = createGraphStore();
    store.bulkLoad({
      id: "x",
      nodes: [
        { id: "a", kind: "file", label: "a" },
        { id: "b", kind: "file", label: "b" },
      ],
      edges: [],
    });
    const path = store.shortestPath("a", "b");
    expect(path.ok).toBe(false);
    if (path.ok) return;
    expect(path.error.code).toBe(PrismErrorCode.GRAPH_ERROR);
  });

  it("lays out nodes on ranks", () => {
    const layout = layoutGraph(fixture);
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.value.positions.a?.y).toBe(0);
    expect(layout.value.positions.b?.y).toBeGreaterThan(
      layout.value.positions.a?.y ?? 0,
    );
    expect(layout.value.positions.c?.y).toBeGreaterThan(
      layout.value.positions.b?.y ?? 0,
    );
  });
});

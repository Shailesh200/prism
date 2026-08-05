# @repo-prism/graph-engine

Typed in-memory graph store on **ngraph** with query primitives for dependency / semantic / feature graphs.

**Implemented:** M-009  
**Depends on:** `@repo-prism/shared`, `ngraph.graph`, `ngraph.path`  
**Surfaces:** call via `@repo-prism/core` once wired (ADR-0004)

## Usage

```ts
import { createGraphStore, layoutGraph } from "@repo-prism/graph-engine";

const store = createGraphStore({ id: "demo" });
store.bulkLoad({
  id: "demo",
  nodes: [
    { id: "a", kind: "file", label: "a.ts" },
    { id: "b", kind: "file", label: "b.ts" },
  ],
  edges: [{ id: "e1", kind: "imports", from: "a", to: "b" }],
});

store.neighbors("a", { direction: "out" }); // ["b"]
store.shortestPath("a", "b"); // ok(["a", "b"])
store.toJSON(); // deterministic node/edge order

layoutGraph(store.toJSON()); // basic layered positions
```

Domain builders (import resolution, semantic edges) land in **M-010 / M-011**.  
`nodesFromIndexSnapshot` only lifts analyzed files to file nodes.

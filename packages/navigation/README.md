# @prism/navigation

Dependency and feature navigation routes + landmark resolution.

**Implemented:** M-016  
**Depends on:** `@prism/shared`

## APIs

| Function | Role |
|---|---|
| `findPaths(graph, from, to, options?)` | Shortest / k-simple dependency paths |
| `shortestPath(graph, from, to)` | Single BFS path (node ids) |
| `navigateFeature(depGraph, features, fromId, toId)` | Feature → feature via file deps |
| `listLandmarks(snapshot, features?)` | Entrypoints, package roots, feature anchors |

Surfaces must call these only through `@prism/core`.

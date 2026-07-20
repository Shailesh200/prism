# @prism/repository-map

Repository Map **data model**: zoom levels, layers, clusters, bookmarks schema, search index.

**Implemented:** M-017  
**Depends on:** `@prism/shared`, `@prism/graph-engine`

## Core entry

Surfaces call `workspace.getRepositoryMap(options)` on `@prism/core` only.

## Zoom

`repo → package → feature → file → symbol` via `zoomIn` / `zoomOut`.

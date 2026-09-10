# Spectrum empty after opening a package

## Cause

Console Iris loaded Spectrum at `zoom: "package"` only and never refetched on drill-in. `RepositoryMapView` still switched the UI to File altitude via `zoomOverride`, then built the file-card tree from package nodes (`kind: "package"`). File-tree helpers ignore those nodes → **On map 0**, empty grid, breadcrumbs `… > Package > File`.

## Fix

1. **`intelligence-view.tsx`** — Cache maps by zoom; `onZoomChange` swaps/fetches the matching host map; prefetch file zoom after package load so drill-in usually has children ready.
2. **`RepositoryMapView.tsx`** — Do not paint file/symbol altitude until the graph has file or symbol nodes (avoids blank canvas while the host map loads).
3. **`map-empty.ts`** — Treat file/symbol zoom over package-only graphs as empty (with back-to-packages suggestion).
4. **Tests** — `file-scope.test.ts` package → children regression; `map-empty.test.ts` package-only at file zoom.

## Note

Worker could not run `bun` rebuilds (no shell). Host should rebuild `@repo-prism/ui` then `packages/dispatch-hub` dashboard after verify.

# Utility overlays — Map / MCP contract (M-041 → M-017)

Agreed DTO for Map layers and MCP tools. Surfaces must consume **`@prism/core` only**.

## Core APIs

```ts
ws.listUtilityOverlayKinds() // → UtilityOverlayKindInfo[]
ws.getUtilityOverlay(kind, { packageId? }) // → UtilityOverlayReport
```

Honors Mono-v1 `selectPackage()` when `packageId` is omitted.

## `UtilityOverlayReport`

| Field | Role |
|---|---|
| `kind` | Well-known overlay id (`api-surface`, `domain-regions`, …) |
| `domain` | Stack domain string (open registry) |
| `graph` | `GraphSnapshotDto` drawable structure |
| `mapLayer` | `{ id, label, colorHint?, nodeKinds }` for Map chrome |
| `findings` | Inspector callouts (`severity`, optional `path`) |
| `packageId` | Set when scoped to a package |

Schemas: `@prism/shared` — `UtilityOverlayReportSchema`, `UtilityOverlayKindSchema`.

## Kind → backlog

| Kind | Phase | Backlog |
|---|---|---|
| `api-surface` | P2 | BE-01 |
| `mobile-nav` | P3 | MO-01 |
| `desktop-boundary` | P4 | DT-01 |
| `notebook-modules` | P5 | ML-01 |
| `data-pipeline-dag` | P5 | DE-01 |
| `iac-resources` | P6 | DO-01 |
| `embedded-regions` | P7 | EM-01 |
| `game-regions` | P7 | GM-01 |
| `qa-test-gaps` | P7 | QA-01 |
| `security-surface` | P7 | SEC-01 |
| `cross-package-impact` | Mono-v2 | MR-06 (requires `index()`) |
| `domain-regions` | Mono-v2 | MR-07 |

## Privacy

Overlays are local filesystem / index heuristics. No network. CWV/Lighthouse remains a separate ingest path (`getCwvReport`).

## M-017 usage

Map data model should treat overlays as optional layers keyed by `mapLayer.id`, colored by `colorHint` / node `attrs.domain`, filtered by workspace package selector.

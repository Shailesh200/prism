# M-023 fixture notes — Code Explorer

Primary Core smoke uses `packages/intelligence/fixtures/m011-refs`
(same golden as M-011 references):

| Query | Expectation |
|---|---|
| `exploreCode({ kind: "symbol", name: "add", path: "helper.ts" })` | Usage in `main.ts` with `kind: "call"` |
| `exploreCode({ kind: "file", path: "main.ts" })` | Related test `main.test.ts` via KG / stem |

Unit coverage for ownership/timeline/similar lives in
`packages/intelligence/src/explorer/report.test.ts` with synthetic snapshots
and `GitFileSignal` inputs (no network).

ADR-0018: composed report; existing `findSymbol` / `findReferences` unchanged.

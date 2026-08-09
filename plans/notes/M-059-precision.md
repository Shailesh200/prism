# M-059 — Reference precision / recall report

| Field | Value |
|---|---|
| Date | 2026-08-09 |
| Branch work | Implemented on `milestone/M-053-presentation-consolidation` (owner asked to stay on this branch) |
| Deep-TS | **Rejected** — [ADR-0034](../adr/0034-deep-typescript-spike.md), [spike note](./M-059-deep-ts-spike.md) |

## Method

Golden fixtures under `packages/intelligence/fixtures/m059-*` (+ extended
`m049-barrel`). Assertions in:

- `packages/analyzer` — extraction goldens (P-A4, P-E4)
- `packages/intelligence` — KG / deps / aliases unit goldens
- `packages/impact` — homonym seed refusal + typeOnly lane
- `packages/core` — `reference-precision.test.ts` end-to-end via Core index

Precision = incorrect seeds or unioned homonyms avoided.  
Recall = intended edges/refs present on the fixture.

## Results

| ID | Fixture | Precision | Recall | Notes |
|---|---|---|---|---|
| **P-A3** | `m059-homonym` | Pass | Pass | Bare `shared` → `{ ambiguous, candidates }`; blast seeds only resolved ids; `resolutionNote` when ambiguous |
| **P-A4** | `m059-member` | Pass | Pass | `g.greet()` / `g?.greet()` / `g.run()` → `kind:"call"`, `via:"member"`, `confidence:"low"`; class methods indexed |
| **P-E4** | `m059-cjs` | Pass | Pass | Static `require("./util.js")` + `createRequire(…)("./util.js")` → edge kind `require` |
| **P-E5** | `m049-barrel` (+ unit `export *`) | Pass | Pass | `resolveLocalExport` chases named re-export and `export *` cycle-safely; `app.ts` → `bar` in `bar.ts` |
| **P-E6** | `m059-tsconfig` | Pass | Pass | Root `tsconfig.json` extends `tsconfig.base.json` with `baseUrl` + `@lib/*`; edge `main.ts` → `helper.ts` |
| **P-E7** | `m059-dts` | Pass | Pass | Import from `ambient.d.ts` has `attrs.typeOnly`; blast lane `type` |

### Stability anchors

| Fixture | Status |
|---|---|
| `m011-refs` blast / findReferences goldens | Unchanged expectations (disambiguated `path` still returns call site) |
| `m049-barrel` file blast | Still lists `apps/web/src/app.ts`; index now also `export *` from `star.ts` |

## Known residual gaps (not M-059)

- Variable-bound `require` after `const r = createRequire(…)`
- Computed member calls `obj[expr]()`
- npm `extends` of published tsconfig packages
- Type-checker overload / import-equals resolution (deep-TS rejected)

## Deep-TS spike

Rejected for this cycle. Heuristic path covers the M-059 goldens; full program
integration is deferred per ADR-0034.

## Verification (2026-08-09)

| Suite | Result |
|---|---|
| `@repo-prism/analyzer` | 19/19 pass |
| `@repo-prism/intelligence` | 174/174 pass |
| `@repo-prism/impact` | 33/33 pass |
| `@repo-prism/core` `reference-precision` + `knowledge-graph` | 8/8 pass |
| Typecheck (shared/analyzer/intelligence/impact/core) | green |

No commit (owner request). Remains uncommitted on `milestone/M-053-presentation-consolidation`.

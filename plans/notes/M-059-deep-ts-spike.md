# M-059 — Deep TypeScript spike (2-day timebox)

| Field | Value |
|---|---|
| Date | 2026-08-09 |
| Milestone | M-059 Reference Precision |
| Decision | **Reject for now** — see [ADR-0034](../adr/0034-deep-typescript-spike.md) |

## Goal

Assess whether an optional `tsc` / `ts-morph` program for on-demand
`findReferences` is worth adopting beside the Oxc heuristic path (ADR-0009).

## What was evaluated (lightweight)

1. **Integration surface** — A real program needs `tsconfig` discovery, project
   references, path mapping, and a durable host API. That duplicates (and then
   fights) the M-059 work on nearest-config / extends / baseUrl already in
   `@repo-prism/intelligence` aliases.
2. **Cost model** — Cold `ts.createProgram` on this monorepo is multi-second;
   keeping a watch program alive contradicts Core’s index-once / local-first
   latency story for MCP/CLI one-shots.
3. **Precision delta vs heuristics** — After P-A3…P-E7 (homonyms, member calls,
   `require`, barrel chase, tsconfig extends, `.d.ts` typeOnly), the golden
   fixtures that previously forced deep-TS consideration are covered by the
   Oxc + KG path. Remaining gaps are dynamic/`import()` variables, overloaded
   call resolution, and cross-project `.d.ts` merging — not the daily blast
   path.
4. **Optional stub** — A no-op `deepTs: false` flag was considered and rejected
   as API noise without a backing implementation.

## Benchmark sketch (heuristic path on M-059 goldens)

| Fixture | findReferences / blast | Heuristic result |
|---|---|---|
| `m059-homonym` | bare name | Ambiguous candidates (correct refusal) |
| `m059-member` | `greet` / `run` | Member refs with `via:"member"`, low confidence |
| `m059-cjs` | deps | `require` edges to `./util.js` |
| `m049-barrel` | `bar` via package | Resolves through re-export to `bar.ts` |
| `m059-tsconfig` | `@lib/helper` | Edge via extends + baseUrl paths |
| `m059-dts` | blast `runtime.ts` | `ambient.d.ts` in type lane |

Deep-TS was **not** wired for a head-to-head run; building that harness would
consume the spike budget without changing the adopt/reject call given the
integration cost above.

## Recommendation

**Reject** deep TypeScript for the default and opt-in product paths in this
cycle. Revisit when:

- A measured recall gap remains on real customer repos after M-061 detectors, or
- An interactive IDE session can amortize a long-lived language service.

Until then, keep ADR-0009’s Oxc default and treat deep-TS as a future optional
lane documented in ADR-0034.

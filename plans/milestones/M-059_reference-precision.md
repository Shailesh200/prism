# M-059 — Reference Precision (The Moat)

| Field | Value |
|---|---|
| Status | **Implemented (uncommitted)** — code landed on `milestone/M-053-presentation-consolidation` per owner; cut/merge still pending |
| Branch | Prefer `milestone/M-059-reference-precision` from latest `main`; work currently on M-053 branch |
| Depends on | M-058 |
| Unlocks | M-060, M-061 |
| Packages | `@repo-prism/intelligence`, `@repo-prism/impact`, `@repo-prism/analyzer`, `@repo-prism/core`, `@repo-prism/shared` |
| Amends | [ADR-0009](../adr/0009-typescript-analyzer-plugin.md); new [ADR-0034](../adr/0034-deep-typescript-spike.md) (Proposed — adopt/reject) |

## 1. Goal

Make `blast_radius` deserve trust. Precision and recall are measured on golden fixtures and
recorded in `plans/notes/M-059-precision.md`. Core indexing and analysis is the moat — this
milestone is brand work that proves the moat is real.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-A3** | Homonym union — [`semantic/build.ts:407-420`](../../packages/intelligence/src/semantic/build.ts) unions all same-named symbols; [`internal.ts:288-290`](../../packages/impact/src/internal.ts) falls back to name-only matching. | Multi-match without `path`/`start` returns `{ ambiguous: true, candidates }` (additive); impact seeds only from resolved symbol ids and adds `resolutionNote` when ambiguous. Fixture: two same-named functions in different files. |
| **P-A4** | Member calls invisible — [`typescript-plugin.ts:385-391`](../../packages/analyzer/src/typescript-plugin.ts) records only bare-identifier callees. | Walk `MemberExpression`/`OptionalMemberExpression` callees, record `kind: "call"` with the property name and a `via: "member"` marker; resolution matches at low confidence per ADR-0009. Fixtures: class method calls, namespace calls, optional chaining. |
| **P-E4** | No `require()`. | Extract static `require('...')` and `createRequire` through the same resolver as ESM; edge kind `require`. Fixture: CJS package. |
| **P-E5** | Barrel resolution stops at the barrel — [`semantic/build.ts:168-181`](../../packages/intelligence/src/semantic/build.ts). | `resolveLocalExport` chases re-export edges including `export *`, cycle-safe, to the defining module. Golden tests on the existing barrel fixture. |
| **P-E6** | Partial tsconfig resolution — [`aliases.ts:63-79`](../../packages/intelligence/src/dependency/aliases.ts). | Resolve the nearest tsconfig per file, follow `extends`, apply `baseUrl` + `paths`; read a root tsconfig even when unindexed (bounded). Fixture: monorepo with `extends` + `baseUrl`. |
| **P-E7** | `.d.ts` runtime edges. | Mark import edges originating in declaration files `typeOnly`; blast treats them as a non-runtime lane. |
| **Deep-TS spike** | Optional deep TypeScript analysis (locked, timeboxed 2 days). | Optional `tsc`/ts-morph program for on-demand `findReferences`; benchmark against the heuristic path on the golden fixtures; ADR-0034 records adopt/reject. No adoption commitment. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Deep-TypeScript adoption beyond the spike ADR | Next planning cycle if ADR-0034 rejects |
| Language expansion (Python, Go, Java) | Next planning cycle (D-11) |
| Multi-signal detectors | M-061 Detection Quality |
| Truncation honesty (P-A5) | M-056 Number Integrity |

## 4. Definition of Done

- [ ] M-058 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-A3, P-A4, P-E4 through P-E7 each have a golden fixture
- [ ] `plans/notes/M-059-precision.md` committed with precision/recall report
- [ ] Deep-TS spike completed; ADR-0034 Accepted or Rejected with benchmark data
- [ ] Existing blast/safe-delete goldens on `m011-refs` unchanged or deliberately updated with evidence
- [ ] `bun run verify:milestone` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 4
- [M-049 Blast Radius Depth](./M-049_blast-radius-depth.md) — multi-lane blast baseline
- [ADR-0009](../adr/0009-typescript-analyzer-plugin.md) TypeScript analyzer plugin
- [ADR-0019](../adr/0019-core-sdk-versioning.md) SDK versioning

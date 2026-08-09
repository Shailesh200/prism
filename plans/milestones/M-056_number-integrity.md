# M-056 — Number Integrity and Truncation Honesty

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-056-number-integrity` (from latest `main`) |
| Depends on | M-053 |
| Unlocks | M-057 |
| Packages | `@repo-prism/core`, `@repo-prism/shared`, `@repo-prism/repository-map`, `@repo-prism/impact`, `@repo-prism/analyzer`, `@repo-prism/mcp-server`, `@repo-prism/cli`, `@repo-prism/app-shell` |
| Amends | — |

## 1. Goal

Everywhere the product states something untrue or incomplete without saying so, make it honest.
Unresolved imports, truncated lists, capped git history, and polyglot blind spots must be visible
on the DTO and in the UI — not silently dropped or implied to be complete.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-A1** | Unresolved imports are computed then dropped — [`workspace.ts:1071`](../../packages/core/src/workspace.ts) returns only `.graph`. | Add `unresolvedImports: { count, sample: string[] }` to the dependency-graph DTO (additive); Core returns it; MCP `dependency_graph` shows count + sample; CLI `deps` prints a footnote; the parse-health factor lists it. Tests: fixture with an unresolvable alias import asserting count and sample on all three surfaces. |
| **P-A2** | Git history cap reported as the total — [`git-signals.ts:19,269`](../../packages/core/src/git/git-signals.ts). | Also run `git rev-list --count HEAD`; `totalCommits` = real total, `windowCommits` = scanned, add `historyTruncated: boolean`; extend `GitRepoSummary` (additive); surface "scanned latest 2,000 of N" in the map activity layer and Trends. Tests: extend the existing `run()` mock pattern in `git-signals.test.ts`. |
| **P-A5** | Hidden truncation caps — symbol zoom 8/file ([`build.ts:292`](../../packages/repository-map/src/build.ts)), regions 8 ([`overview-model.ts:118`](../../packages/shared/src/overview-model.ts)), blast forward deps 80 ([`blast-radius.ts:160`](../../packages/impact/src/blast-radius.ts)). | Add `truncated` + `totalCount` to each DTO; UI renders "showing N of M". Tests per package. |
| **P-A6** | Polyglot distortion — only 8 TS/JS extensions are analyzed ([`typescript-plugin.ts:29-38`](../../packages/analyzer/src/typescript-plugin.ts)); graph-derived metrics silently exclude everything else. | Publish `graphCoveragePct` (analyzed analyzable files / total files) on the health DTO, the Overview footer and MCP `repository_health`; relabel the coupling factor "TS/JS import coupling". Tests: polyglot fixture asserting the percentage and the label. |
| **P-A7** | Blast radius never says what it cannot see. | Static `coverageLimitations: string[]` on `BlastRadiusReport` listing the invisible classes (DI containers, string-keyed registries, event buses, template/i18n string refs, runtime-loaded config, generated-code consumers); rendered in the UI and the MCP tool description. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Homonym union and member-call precision | M-059 Reference Precision |
| Multi-signal detectors and feature inference | M-061 Detection Quality |
| Presentation-layer number fixes (N-01–N-11) | M-053 (already in progress) |
| Language expansion beyond TS/JS coverage reporting | Next planning cycle |

## 4. Definition of Done

- [ ] M-053 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-A1 through P-A7 implemented with tests on all three surfaces where applicable
- [ ] `plans/notes/M-056-number-audit-2.md` records every before/after
- [ ] Additive contracts only per [ADR-0019](../adr/0019-core-sdk-versioning.md)
- [ ] `bun run verify:milestone` green
- [ ] Owner smoke: a repo with unresolved imports visibly says so
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 1
- [M-053 Presentation Consolidation](./M-053_presentation-consolidation.md) — N-xx number-integrity fixes
- [ADR-0019](../adr/0019-core-sdk-versioning.md) SDK versioning
- [ADR-0029](../adr/0029-signal-provenance.md) signal provenance

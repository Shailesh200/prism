# M-056 — Number integrity audit (round 2)

| Field | Value |
|---|---|
| Milestone | [M-056](../milestones/M-056_number-integrity.md) |
| Date | 2026-08-09 |
| Branch | Working tree on `milestone/M-053-presentation-consolidation` (commit branch later) |
| Rule | Additive contracts only ([ADR-0019](../adr/0019-core-sdk-versioning.md)). |

## Corrections (P-A1, P-A2, P-A5, P-A6, P-A7)

| Id | Location | Before | After | Number changed? |
|---|---|---|---|---|
| P-A1 | Core `getDependencyGraph` | Returned only `GraphSnapshotDto` (`.graph`); intelligence `unresolved[]` dropped | Additive `DependencyGraphDto` with `unresolvedImports: { count, sample }` | No (new field) |
| P-A1 | MCP `dependency_graph` | Graph only | Same DTO + description mentions `unresolvedImports` | No |
| P-A1 | CLI `deps` | Nodes/edges only | Footnote + field when count &gt; 0; JSON includes `unresolvedImports` | No |
| P-A1 | Health `parse_health` | Analyzed/failed counts only | Breakdown row `Unresolved imports` + note when &gt; 0 | No (breakdown additive) |
| P-A2 | `GitRepoSummary` / `parseGitLog` | `totalCommits === windowCommits` (scanned, capped at 2000) | `windowCommits` = scanned; `totalCommits` from `git rev-list --count HEAD`; `historyTruncated` | **Yes — total now real** |
| P-A2 | Map activity layer | "Recent commit heat (local git history)" | Appends "scanned latest W of T" when truncated | Label only |
| P-A2 | Overview / Trends | No scan-cap honesty | Footnote / KPI note when `historyTruncated` | Label only |
| P-A5 | Symbol zoom map | Silent `.slice(0, 8)` per file | `RepositoryMap.truncated` + `totalCount`; UI "showing N of M symbols" | No (meta) |
| P-A5 | Overview regions | Silent max 8 | `OverviewModel.truncated` + `totalCount`; UI "showing N of M"; `totals.regions` = full count | **totals.regions may rise** |
| P-A5 | Blast `forwardDependencies` | Silent `.slice(0, 80)`; UI further sliced to 40 | Cap 80 with `forwardDependenciesTruncated` + `TotalCount`; UI shows all returned rows + "showing N of M" | No (meta; UI may show up to 80) |
| P-A6 | `HealthScore` | No coverage field; coupling labeled `Coupling` | `graphCoveragePct` (analyzed / `filesTotal`); label `TS/JS import coupling` | Coverage new; coupling score unchanged |
| P-A6 | Overview DNA / MCP health | Silent polyglot blind spot | Footer + MCP description surface coverage % and relabeled factor | No |
| P-A7 | `BlastRadiusReport` | Soft `coverageNote` only | Static `coverageLimitations: string[]` always; UI list + MCP tool description | No |

## Fixtures

- `packages/intelligence/fixtures/m056-unresolved` — relative import to missing module
- `packages/intelligence/fixtures/m056-polyglot` — TS + Go + Python inventory (unit coverage via synthetic snapshot)

## Tests added / extended

- `packages/core/src/dependency-graph.test.ts` — unresolved count/sample + parse-health breakdown
- `packages/core/src/git/git-signals.test.ts` — `enrichSummaryWithCommitTotal`
- `packages/shared/src/overview-model.test.ts` — region truncation meta
- `packages/intelligence/src/health/score.test.ts` — `graphCoveragePct` + coupling label
- `packages/impact/src/blast-radius.test.ts` — forward-deps cap + `coverageLimitations`
- `packages/repository-map/src/build.test.ts` — symbol zoom truncation
- `packages/mcp-server/src/server.contract.test.ts` — unresolved fixture + health/blast honesty
- `packages/cli/src/cli.integration.test.ts` — `deps` JSON + human footnote

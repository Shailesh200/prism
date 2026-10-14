# M-096 — Graph model, artifact, `graph` tool

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-096-graph-artifact-tool` (from latest `main`) |
| Depends on | M-095 Verified |
| Unlocks | M-097 |
| Packages | `intelligence` (doc / ADR / git / memory nodes), `analyzer` (remaining M-059 precision), `graph-engine`, `core` (`graph()` API), `mcp-server` (`graph` tool), `ui` (graph renderer, static export), `cli` (`prism graph open`, `export`), `plugin` (`/prism-graph`) |
| ADR | [ADR-0062](../adr/0062-prism-graph-replaces-repository-map.md) |
| Absorbs | M-059 remaining scope |

## 1. Goal

A graphify-style graph of code, tests, docs, ADRs, git history and memories that agents query through one tool and developers open as `graph.html`. Program §7.2–7.4.

## 2. In scope

| Item | Detail |
|---|---|
| Node and edge kinds | Program §7.2 table; provenance on every edge |
| Precision | M-059 remainder: member calls, barrels, tsconfig paths, `require()`, homonyms. Precision measured on `m011-refs` and the R0 repos |
| Core API | `graph({ mode, … })` with `find`, `neighbors`, `path`, `explain`, `query`; bounded results, Envelope `truncated`, token budget |
| MCP `graph` | Replaces `find_symbol` / `explain_area` stand-ins in the default set. The seven old tools stay behind `PRISM_MCP_FULL` for one milestone, then are removed |
| `graph.html` | Self-contained, offline, from `@repo-prism/ui`. Package → file → symbol drill. Layers: communities, hotspots, cycles, test reach, blast overlay. Search. Copy-as-prompt |
| `GRAPH_REPORT.md` | Program §7.3 contents; every entry links to a node |
| `graph.json` | Versioned schema in `@repo-prism/shared`, documented |
| CLI | `prism graph open`, `prism graph export --out <dir>` |
| Command | `/prism-graph` opens the artifact and prints the report summary |

## 3. Out of scope

- LLM-derived edges (never: no model in Core). Non-TS/JS languages (Tree-sitter stays deferred).

## 4. DoD

- [ ] `graph.html` opens offline in Chrome, Safari, Firefox; 10k-file fixture stays interactive (budget in `08_PERFORMANCE.md`)
- [ ] `GRAPH_REPORT.md` on the five fixture repos has zero false entries (checked by hand, Claude Code triage plus owner sign-off)
- [ ] The `graph` tool answers the six orientation-benchmark questions within budget
- [ ] Default tools now: `prepare_change`, `blast_radius`, `graph`, `guard_session`, `test_impact`, `repository_overview`
- [ ] No-network suite green; `graph.html` makes no requests (checked in Playwright)
- [ ] Claude Code smoke: the agent answers "how does A reach B" with one `graph` call; transcript saved
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 4a. Implementation status (one-pass build on the M-087 branch)

Built:

- `workspace.graph(query, budget)` in Core with `find`, `neighbors`, `path`, `explain` and `query` (`tests_reaching`, `importers_of`, `imports_of`, `files_in_importing`), composed from the dependency graph, knowledge graph, navigation and impact. Provenance on every edge; one token budget (default 1,500) with `truncated`. Contract in `shared/src/graph-query.ts`.
- MCP `graph` tool. Default tools are now `prepare_change`, `blast_radius`, `graph`, `guard_session`, `test_impact`, `repository_overview`. The seven older graph tools stay behind `PRISM_MCP_FULL`.
- `workspace.exportGraph()` and `prism graph export [--out <dir>]`: versioned `graph.json` (packages, files, tests, exported symbols, ADRs; contains / imports / tests / declares / rationale_for edges) and `GRAPH_REPORT.md` (most connected, cycles, untested hotspots, lone cross-package imports, orphans, questions). The report lists measured facts only; orphans are filtered conservatively (re-exports, alias-reachable names, barrels and config files are excluded) after a first run on this repo listed barrels and alias-imported files.
- `/prism-graph` command.

Open: `graph.html` (the self-contained artifact from `@repo-prism/ui`) and `prism graph open`; ADRs that point at code that no longer exists; the M-059 precision work; the hand-checked report on the five fixture repos; the Claude Code smoke.

## 5. Verification

`bun run verify:milestone` · Playwright offline check · smoke `plans/notes/smoke/M-096.md` · screenshots in the milestone notes.

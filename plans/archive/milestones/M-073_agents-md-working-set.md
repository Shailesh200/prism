# M-073 — Living AGENTS.md + Working Set

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-073-agents-md-working-set` (from latest `main`, M-072 merged) |
| Depends on | M-070 (prepare/reuse), M-071 (finding fingerprints), M-072 (Prism Guard) |
| Packages | `shared`, `core`, `cli`, `dispatch`, `mcp-server` (M-073 scope); `intelligence`, `app-shell`, `vscode-extension`, `playground` touched only by the M-072 follow-up fixes below |
| Program | [PROGRAM_agent-native-3-PHASES.md](../../milestones/PROGRAM_agent-native-3-PHASES.md) — Phase 2 |

## 1. Goal

Two independent Phase 2 Cut 1 capabilities:

1. **Living AGENTS.md** — a deterministic, no-LLM-prose summary of features,
   import cycles, test locations, and git ownership, generated from the
   index and written only to `~/.prism` — never into the repository, so it
   never needs a commit or review of its own. `--check` re-verifies the
   claims it made against a fresh index.
2. **Working Set** — the files, symbols, decisions, and neighbors a job (or
   an inline chat with no job at all) has accumulated, so a resume or a
   later session does not start from zero.

## 2. In scope

### Living AGENTS.md

- Core `generateAgentsMd()` / `checkAgentsMd()` on `PrismWorkspace`,
  composing `list_features` + `dependency_cycles` + test-file paths + git
  ownership (`readGitSignals`) into markdown, plus a machine-readable
  claims block (`<!-- prism:agents-md-claims -->`) `check` re-verifies.
- Writes to `~/.prism/workspaces/<workspaceKey>/agents.md`
  (`@repo-prism/shared`'s new `prism-home.ts`) — never the repo.
- CLI `prism agents-md generate` / `prism agents-md check`.
- MCP `agents_md` tool (`action: generate | check`) and `prism://agents-md`
  resource (regenerates on each read).

### Working Set

- `WorkingSet` schema in `@repo-prism/shared`: `{jobId?, files, symbols,
  decisions, neighbors}`.
- `JobRecord.workingSet` (dispatch), merged in at reap time from what the
  worker actually delivered (`auditCitedPaths` → `RunState.workingSet` →
  `mergeWorkingSet` in `run-state.ts`'s `applyRunToJob`), deduped and capped
  at 50 entries per list.
- `composeWorkerPrompt` injects a "Working set from prior progress" block
  from `job.workingSet` into the next `start_job` / resume prompt.
- MCP `working_set` tool (`action: get | set`, optional `jobId`): with a
  `jobId`, reads/merges onto that job's own set; without one, reads/merges
  a standalone, per-workspace set (`working-set.json`, mirroring
  `prepare-last.ts`) for an inline session with no job.

## 3. Out of scope

- No IDE panel UI for either capability (not requested for this cut).
- Owners in AGENTS.md are git-history top contributors per feature, not a
  CODEOWNERS parser (no CODEOWNERS convention exists in this repo yet).
- W2 "neighbors" population (1-hop KG from files) is a caller concern via
  `working_set` `set` — Working Set itself is a storage/injection
  mechanism, not a new graph query.
- Fixed, unrelated to this milestone: `packages/dispatch/src/runtime.ts`
  was missing an `AgentRegistry` import (broke typecheck repo-wide since a
  prior, unrelated commit landed directly on `main`). One-line fix, called
  out separately to the owner.

## 4. Definition of Done

- [x] Fixture: `generateAgentsMd()` writes only under `PRISM_HOME`, never
      adds an AGENTS.md (or anything else) to the repo tree; `checkAgentsMd()`
      passes immediately after (`packages/core/src/agents-md.test.ts`)
- [x] Fixture: hand-inverted cycle claim in the claims block fails `check`
      with a `stale-cycle` issue (`packages/core/src/agents-md.test.ts`)
- [x] Pure round-trip: `buildAgentsMdContent` → `parseAgentsMdClaims`
      (`packages/core/src/agents-md.test.ts`)
- [x] CLI integration: `prism agents-md generate` then `check` under an
      isolated `PRISM_HOME`, plus a usage-error (exit 2) for an unknown
      action (`packages/cli/src/cli.integration.test.ts`)
- [x] `mergeWorkingSet` unions/dedupes/caps each list at 50
      (`packages/dispatch/src/working-set.test.ts`)
- [x] Standalone (no-jobId) working set persists per workspace and merges
      across writes (`packages/dispatch/src/working-set.test.ts`)
- [x] Reap merges a run's delivered-paths working set onto whatever the job
      already had, not over it (`packages/dispatch/src/run-state.test.ts`)
- [x] `composeWorkerPrompt` injects files/symbols/decisions/neighbors from
      `job.workingSet` (`packages/dispatch/src/worker-orientation.test.ts`)
- [x] MCP contract: `agents_md`, `working_set`, and `prism://agents-md`
      advertised and answer against the fixture
      (`packages/mcp-server/src/server.contract.test.ts`)
- [x] Docs regenerated (`bun run docs:reference`): tool count 47 → 49,
      `docs/reference/mcp-tools.md`, `docs/reference/capabilities.md`,
      `docs/reference/cli-commands.md`, `docs/start/install.mdx`
- [x] `bun run verify:milestone` green

## 5. Design notes

- **Package boundary**: AGENTS.md generation and file I/O live entirely in
  Core (`generateAgentsMd`/`checkAgentsMd`), not Dispatch — the CLI has no
  Dispatch dependency and AGENTS.md is fundamentally an analysis-composition
  concern, consistent with "user-facing surfaces consume Core for analysis."
  Working Set is the opposite: it is inherently a Dispatch/job concern
  (`JobRecord`, worker prompts), so it lives entirely in `@repo-prism/dispatch`
  and is exposed only through the MCP Dispatch tool pack, never Core.
- **Claims format**: a fenced HTML-comment JSON block
  (`<!-- prism:agents-md-claims {...} -->`) rather than parsing prose,
  so `check` is a structural diff against `list_features` /
  `dependency_cycles`, not a regex over Markdown.

## 6. Live dogfooding (out of M-073 scope, fixed on this branch)

Testing M-073 against this real, large repo — not a small fixture — hit
`prism wake` / Spectrum, which surfaced pre-existing M-072 (Prism Guard)
bugs for the first time at real scale, plus one unrelated environment bug:

- **`@repo-prism/shared` browser crash**: `prism-home.ts` used
  `node:crypto`/`node:os`, but `shared` ships into browser bundles
  (Spectrum, the extension webview). Moved to `@repo-prism/core`
  (Node-only) — this is the version described in §5 above; the module
  briefly lived in `shared` during development only.
- **Guard duplicate-check performance**: `scoreReuse` rebuilt the whole
  knowledge graph per call and was invoked once per exported symbol in the
  session — a 47-file session against this repo hung the single-threaded
  Spectrum dev server for 3+ minutes with no bound. Fixed by reusing the
  caller's knowledge graph and capping checks at 40 symbols
  (`packages/intelligence/src/guard/session.ts`).
- **Guard duplicate false positives**: the heuristic flagged any two
  exported functions sharing one generic word (e.g. `fetchDna` /
  `fetchHealth` both containing "fetch") — floods a large, conventionally
  named codebase. Now also requires one name to contain the other.
- **Guard never wired into Spectrum**: the shield nav icon existed (shared
  `AppSidebar`) but no `/api/guard` route, transport case, or view branch
  existed in `apps/playground`. Added all three, mirroring the existing
  per-capability route pattern.
- **`OverviewScreen`'s hand-written nav dispatch** was missing a `"guard"`
  case, so Guard only opened from the Impact tab, never from Overview.
- **`GuardScreen` UI**: rewritten to reuse `AuditLogsPanel`'s dark-theme
  row/detail pattern (the original used undefined CSS variables that
  silently fell back to light colors); flags grouped into counted badges
  instead of one chip per flag; sessions cached at the module level so a
  tab switch doesn't recompute; row click vs. "open file" click no longer
  conflict (a dedicated icon replaces the old nested-button-in-row); added
  a column header row.

None of this touched `dispatch`, `cli`, or `mcp-server` — the actual M-073
surface. Reported here per the same pattern as M-071's dogfooding notes.

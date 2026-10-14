# Prism unified plan: precision + reliability

This plan merges `plans/notes/prism-2-precision-plan.md` (the "precision plan", cited as **P§n**) and the reliability audit (cited as **R**). Names and behaviour come from a read-only read of the working tree on `milestone/M-087-focus-reset-plan`. The plan is ordered by dependency: no dates, one release. Dashboard and app UI are out of scope.

**Prism's one job:** before an agent edits, hand it the right files, the real dependents and the tests that reach them. When it stops, say what was proven. This works the same in Claude Code, Cursor, Codex and opencode, offline, and without the developer having to think about it.

---
## 0. Scope

### 0.1 Kept and in scope
MCP server (`packages/mcp-server`), daemon (`packages/daemon`), the hook (`packages/plugin/hooks/prism-hook.mjs` and `mcp-server/src/safety/hook-command.ts`), the CLI (`packages/cli`), indexer/resolver/graph (`indexer`, `graph-engine`, `impact`, `core`), Prepare (`core/prepare-change`), Envelope (`core/envelope/*`), the receipt (`mcp-server/src/safety/receipt.ts`, `packages/checks`), lenses (`shared/lens-route.ts`, `shared/lens-store`, `mcp-server/src/safety/lenses.ts`), the plugin pack and skills, the GitHub Action (`action/`), install, upgrade and uninstall.

### 0.2 Removed (delete the code, docs, tests and tool registrations)
| Item | Today | Action |
|---|---|---|
| Dispatch + dispatch-hub | `packages/dispatch`, `packages/dispatch-hub`, port 17330, statusLine | Delete the packages and remove the spawn from the MCP server. Uninstall stops any running hub (§8.3) |
| IDE map | already gone | Delete `repository_map` and `prism map` |
| Health and reports | `repository_health`, `engineering_health`, `health_history`, `backend_report`, `testing_report`, `security_report`, `prism health/engineering/testing/security/backend/bundle`, first-run card health list (P§5) | Delete. P§5 shrinks to the orphan/entry-point definitions that `safe_delete` needs (§4.4) |
| Inferred features | `feature_graph`, `list_features` | Delete (heuristic, not an agent need) |
| `prism-ship` skill | `packages/plugin/skills/prism-ship` | Delete. Its *Impact* and *Verification* sections become the `prDescription` output of `review_changes` (§5.1, T-REV) and step 4 of `prism-review-pr` |
| `breaking_change_hints` | already marked deprecated | Delete. Hints stay inside `blast_radius` and `review_changes` |

### 0.3 Final MCP tool surface
**Default (registered with no environment variables): 9 tools.**
`prepare_change`, `blast_radius`, `test_impact`, `review_changes`, `safe_delete`, `rename_impact`, `guard_session`, `repository_overview`, `graph`.

**Opt-in (listed in `~/.prism/config.json` `extraTools[]`; `PRISM_MCP_FULL` is deleted):** `dependency_graph`, `knowledge_graph`, `dependency_cycles`, `list_packages`, `explain_area`, `explore_code`, `list_findings`, `agents_md`, `workspace_status`, `capabilities`, `review_with`, `receipt` (new, §5.10).

**Merged (old names are deleted in 2.0; no aliases, no compatibility):**
- `work_order` → the `order` field of `prepare_change`.
- `find_symbol`, `search_symbols`, `find_references`, `dependency_route` → `graph` modes `find`, `search`, `refs`, `path` (plus the existing `neighbors`, `explain`). The old names no longer exist. Calling one gets the MCP SDK's standard unknown-tool error. There's no hint and no migration doc.
- `repository_dna`, `stack_profile`, `landmarks` → `repository_overview`.
- `changed_paths` → the `paths` field of `review_changes`.
- `lens` → CLI `prism lens …` only.

**Invariant (test `skills-tools.contract`):** every tool named by a shipped skill, command, prompt, hook or server instruction is in the default set. This fixes the `prism-lens` → `review_with` bug, R / my audit.

### 0.4 Delete in 2.0 (no backward compatibility)
Found in the local repo, read-only. Delete the code, tests, docs, config, CI steps and package.json/workspace entries. No aliases or shims.

**Packages**
1. `packages/dispatch/` (jobs, queue, worktrees, workers, `claude-worker-child.ts`, `agent-registry.ts`, …)
2. `packages/dispatch-hub/` (loopback server on port 17330, `statusline.ts`, `ensure.ts`, `update.ts`, `hub-record.ts`, dashboard views)
3. `packages/host-session/src/host-dispatch.ts`, plus the dispatch messages in `protocol.ts` and `protocol-guards.ts`
4. `packages/repository-map/` (map engine behind `repository_map` and `prism map`). Delete only after checking `repository_overview`/`landmarks` don't import it; if they do, move what's needed into `core` first

**MCP tools** (`packages/mcp-server/src/tools/*`)
5. `repository_health`, `repository_map` (`tools/orientation.ts`)
6. `engineering_health`, `health_history`, `backend_report`, `testing_report`, `security_report` (`tools/reports.ts`; keep `explore_code` by moving it to `tools/graphs.ts`)
7. `feature_graph`, `list_features` (`tools/graphs.ts`)
8. `breaking_change_hints`, `changed_paths` (`tools/impact.ts`)
9. `find_symbol`, `search_symbols`, `find_references`, `dependency_route` (`tools/graphs.ts`, folded into `graph`)
10. `repository_dna`, `stack_profile`, `landmarks` (`tools/orientation.ts`, folded into `repository_overview`)
11. `work_order` (`tools/work-order.ts`, folded into `prepare_change`)
12. `lens` MCP tool (`tools/lenses.ts`; moves to the CLI)
13. The dispatch/hub spawn and job wiring in `mcp-server/src/daemon.ts` and the server bootstrap (ADR-0035 import of `@repo-prism/dispatch`)

**Core and engine**
14. Health: `core` health, engineering-health, health-history, domain-report, backend-report, testing, overlays, bookmarks modules and their tests (`packages/core/src/health*.test.ts`, `engineering-health.test.ts`, `domain-report.test.ts`, `backend-report.test.ts`, `overlays.test.ts`, `bookmarks.test.ts`, `core/src/testing/`)
15. `packages/indexer/src/cache/health-history.ts` and its migration in `indexer/src/cache/migrations.ts` (start 2.0 with a fresh schema v1; drop old migrations)
16. `packages/core/src/pagespeed.ts`, `stage-devops-remote.ts`, `github-ci.ts` and `intelligence/src/utilities/github-ci.ts`, `overlays.ts` (report-only integrations)
17. Feature-graph inference (`core/src/feature-graph*`, map zoom levels in `map.test.ts`)
18. Legacy verify steps: `LegacyVerifyStep` / `planFromLegacySteps` in `packages/checks/src/verify.ts:59,373`

**CLI** (`packages/cli/src/commands/`)
19. `reports.ts` (`health`, `engineering`, `testing`, `security`, `backend`, `bundle`)
20. `dna.ts` and the `map`, `stack`, `features`, `landmarks` commands in `structure.ts` and `understand.ts`
21. `first-run.ts` health card (keep a one-line "indexed N files" if wanted)
22. Dispatch-related pruning in `data-prune.ts`

**Plugin, skills, hooks**
23. `packages/plugin/skills/prism-ship/` and its entry in `plugin/src/definition.ts`
24. The `startDaemon` pid probe and npx fallback in `packages/plugin/hooks/prism-hook.mjs:236-307`, and the `WARMING` text (`:133`), replaced per §2.2, §5.8

**Flags and config**
25. `PRISM_MCP_FULL` (`mcp-server/src/tools.ts` `visibleIntelligenceTools`), replaced by `extraTools[]`
26. `PRISM_HUB`, `PRISM_HUB_HOME`, `PRISM_HUB_PORT`, and the Claude `statusLine` setup (`dispatch-hub/README.md`)
27. `--prefer-online @latest` in `packages/plugin/dist/pack/mcp.json`, plus the npx re-launch path in `mcp-server/src/auto-update.ts:99-116`
28. Root `opencode.json` dev config with an absolute `/Users/shaileshjha/Prism` path (replaced by `prism install opencode`)

**IDE extension and app packages** (deleted entirely — Decision 27)
29. `packages/app-shell` and `apps/playground`: whole packages, with their workspace entries, build/moon tasks, tsconfig references, CI jobs, publish entries and docs (`start/playground`).
30. `packages/vscode-extension` and `packages/cursor-extension`: whole packages, with `publish-extension.yml`, VSIX scripts, `docs/reference/ide-settings.md` and every "VS Code"/"Cursor extension" tab or step in docs. `packages/ui` keeps only the design tokens and motion helpers the website imports. `apps/website` stays, with every reference to deleted features removed.

**Docs** (`docs/`)
31. `guides/track-health.mdx`, `guides/investigate-domain.mdx`, the health parts of `guides/envelope-and-iris.mdx`, `concepts/dna-and-stack.md`, `concepts/risk-bands.md` (health parts), the Dispatch guide `guides/dispatch` (README link), `help/troubleshooting.md` health/map/feature sections (lines 56-62, 83-98, 170-182), README CLI "Reports" and map rows, and any "~40 tools" or "28 tools" counts
32. `CHANGELOG.md` keeps history; nothing else references deleted names

**CI and scripts**
33. Dispatch/hub tests from `vitest.workspace.ts` and `.github/workflows/*`; `scripts/spike-claude-bg.sh` (dispatch spike); bench cases for removed tools (`scripts/bench`)
34. `scripts/check-publish-exports.mjs` entries for deleted packages; `publish-npm.mjs` order entries for `dispatch`, `dispatch-hub`, `repository-map`

**Graph artifacts**
35. `graph.html` (offline viewer from `@repo-prism/ui`), `GRAPH_REPORT.md` generator, the `prism graph open` command, and their Playwright and browser tests (`commands/graph.ts`, M-096). `prism graph export` (`graph.json`) stays.

**Found by the coverage audit (Appendix A.1)**
36. Env vars `PRISM_NODE`, `PRISM_WORKER`, `PRISM_DISPATCH_ROLE`, `PRISM_JOBS`, `PRISM_JOBS_LOCAL`, `PRISM_JOB_ID`, `PRISM_LAB_PORT`, `PRISM_CONSOLE_HOST`, `PRISM_CONSOLE_ALIAS`, `PRISM_PLAYGROUND*`, `PRISM_TOAST_EVENT`, `PRISM_LIVE_MODELS`, `PRISM_BUNDLE_STATS_PATH`; consent purposes `network.pagespeed`, `network.github` (`shared/src/consent-purposes.ts`); CLI flags `--badge`, `--zoom`.

37. `prism graph hooks install|uninstall` and the `post-checkout`/`post-merge`/`post-commit` git hooks it writes (`cli/src/commands/graph.ts:38,274-319`); `GRAPH_GIT_HOOKS`.

**Verification for this list:** a test (`deleted-names.contract`) runs `rg` over the repo (excluding `CHANGELOG.md` and `plans/archive`) for each deleted tool, command, flag and package name and must find zero hits.

## 0.5 Close out the current milestone (M-087) and the open milestones M-088…M-100
Source: `plans/PROGRESS.md:98-111`, `plans/milestones/M-087…M-100`, and `git status` on `milestone/M-087-focus-reset-plan`. `main..HEAD` has no commits: all M-088…M-100 work is **uncommitted** in the working tree, including about 60 modified files and a deleted `docs/guides/dispatch.md`. So nothing in M-088…M-100 is Verified; every DoD box below is unchecked in its file.

**Step 0 (before any plan work): checkpoint the working tree.** Owner approves a commit of the current tree on `milestone/M-087-focus-reset-plan` (AGENTS.md forbids committing without approval). Then capture the Phase 0 baseline (§9.6) on that commit. Without this, "before vs after" can't be measured.

| Item (file:line) | Status | 2.0 verdict | Where it goes |
|---|---|---|---|
| M-087 DoD: owner approves program and ADR-0060…0066, hero wording, `docs:check` + `check-plan-progress` green, commit/merge (`M-087_focus-reset-plan.md:34-38`) | pending | **Keep.** Approval now covers this unified plan; ADR-0066 (Envelope) and ADR-0064 (surface cut) need amending to match §0.3/§0.4 | Close-out step C-1 |
| M-088 identity + hero copy | planned | **Keep** (copy only; no code risk) | Fold into Phase 8 docs |
| M-089 one build everywhere: one Prism server in Cursor = `DEFAULT_TOOL_NAMES`, Claude plugin version = server version, `doctor --surfaces`, one stop → one receipt and one hook-log line, orientation not "still indexing", `dev:link/unlink` (`M-089:38-47`) | planned | **Keep, rewritten:** `hook-log` → `events.jsonl`; `doctor --surfaces` → `prism doctor` editor section (§8); "Marketplace extension gone; local VSIX" → **drop** (IDE out of scope). Node 24.18.1 suite green → keep as Node 24 LTS | Phase 1 + Phase 7 (C-2) |
| M-090 hygiene: branches/worktrees/stashes, `prism data prune`, plans archive, ADR index (`M-090:35-40`) | planned | **Keep:** prune (rewrite keep-rules for the 2.0 layout), archive, ADR index. **Drop:** branch/stash tables (one-off owner action, not product) | Phase 1 (C-3) |
| M-091 surface cut: default tool set, `PRISM_MCP_FULL=1` full pack, `instructions.ts` ≤ 1.5 KB, no `@repo-prism/dispatch` dep, memories readable after the move (`M-091:38-44`) | planned, code partly in tree (`tools.ts` `DEFAULT_TOOL_NAMES`) | **Keep, rewritten:** default = the 9 tools of §0.3 (not M-091/M-096's 6); `PRISM_MCP_FULL` → `extraTools[]`; ≤ 1.5 KB instructions kept. **Drop** the "memories readable after the move" migration test (no backward compatibility); memories start fresh in 2.0 | Phase 6 (C-4) |
| M-092 receipt v2: R2 replay (no pre-existing failure reported as `failed`; catch rate ≥ R0's 5/7), caused-vs-already-failing, session scope, tree-safety (baseline run restores tree byte-for-byte), one markdown renderer for `action/`, kill test (`M-092:37-43`) | planned, code in tree | **Keep all.** The baseline-aware verdict maps to §5.7. The tree-safety test becomes RE-10. R2 becomes a release-gate benchmark (§9.6 B3) | Phase 4 (C-5) |
| M-093 Prepare v2: replay eval `scripts/bench/prepare-eval.ts` (**does not exist yet**), E0 baseline before ranking changes, recall@pack ≥ E0 − 1, p50 ≤ 2k / p95 ≤ 6k tokens, prompt hook in CC + Cursor parity, detection unit tests (`M-093:21-40`) | planned; eval harness missing | **Keep.** The eval becomes B2 (§9.6). The p95 ≤ 6k budget is **superseded** by the hard 2,000 cap (§5.1). Co-change signal and `rationale_for` notes: keep as candidate ranking features, gated by B2 | Phase 0 (harness + E0) and Phase 3 (C-6) |
| M-094 Envelope v2: footer in every receipt, `prism envelope` = hand count, over-budget alarm on a fixture `list_features` call, privacy schema test + `PRIVACY.md` (`M-094:35-40`) | planned | **Keep,** except: the alarm fixture changes from `list_features` (deleted) to `knowledge_graph` without limit. **Drop** the Iris screen (UI) | Phase 6 (C-7) |
| M-095 graph daemon: auto-Prepare p95 ≤ 300 ms **not met at 10k (1.7 s)**; symbol answer after edit 2.3 s at 10k; CC smoke "orientation immediately" (`M-095:35-41`, `PROGRESS.md:106`) | partial | **Keep.** These become B5 targets (§9.6) | Phase 4 (C-8) |
| M-096 graph tool + artifact: `graph` answers the six orientation questions in budget; `GRAPH_REPORT.md` zero false entries on five fixtures; `graph.html` offline; no-network suite (`M-096:37-44`) | planned | **Keep:** `graph` tool, `prism graph export` (`graph.json`), no-network test. **Rewrite** the six orientation questions without the health question (B1). **Delete:** `graph.html`, `GRAPH_REPORT.md`, `prism graph open` (§0.4 #35). **Superseded:** its 6-tool default list | Phase 6 (C-9) |
| M-097 first run in 60 s: report card (health, cycle, untested hotspot, orphan), 20-repo precision gate with owner labels (`M-097:33-38`) | planned | **Drop the card's health line.** Keep a minimal first run: `prism` with no args indexes, prints "indexed N files in T s; try: prism review", and the time budget (T6). **Drop** the 20-repo precision gate (replaced by B2/B4 with labelled golden repos) | Phase 8 (C-10) |
| M-098 real-agent proof: A/B with CIs, calibrates Envelope "saved" (`M-098:34-39`) | partial: a run exists (`plans/notes/benchmark-real-agents.md`, 33 runs per arm on hono and es-toolkit, 11 tasks) | **Keep.** It's the calibration study of §9.3 (B6). Re-run after the plan, against the Phase 0 numbers | Phase 8 (C-11) |
| M-099 delete Dispatch + dead UI: 23 → about 18 packages, ≥ 50k lines removed, no dispatch references (`M-099:36-41`) | planned | **Keep,** superseded by and merged into §0.4 (which is wider) | Phase 1 (C-12) |
| M-100 relaunch: README, seven-page docs, `/benchmarks`, copy test, claims only where M-098 supports them (`M-100:34-38`) | planned | **Keep** docs, copy test and claims rule. Website and `/demo` are out of scope (UI) | Phase 8 (C-13) |
| `scripts/bench/budgets.json` ops `repository_map`, `dna`, `health` | live | **Drop** these ops; add `prepare`, `review_changes`, `receipt`, `graph` | Phase 0 (C-14) |

### Close-out contracts
- **C-1 Approvals:** owner approves this plan as the 2.0 program; ADR-0064/0066 amended; new ADRs for: no backward compatibility, TS/JS only, rule-path parity, the 1.x wipe. Done: ADR index lists them as Accepted; `docs:check` and `check-plan-progress` green.
- **C-2 One build everywhere:** `prism doctor` shows, for each installed editor, one Prism server whose version = `packages/mcp-server/package.json` and whose tool list = the default set. Re-adding an `npx … @latest` entry makes `doctor` fail. Tests: S-INS-2, DOC-1. Done: green on the dev machine and in the install matrix.
- **C-3 `prism data prune`:** dry-run lists, `--yes` removes only listed items; keep-rules: current workspaces, lenses, config, last 20 receipts per workspace. Tests: PRUNE-1…3.
- **C-4 Surface cut:** `tools/list` = the 9; `instructions` ≤ 1.5 KB (test); no dependency on deleted packages (`deleted-names.contract`).
- **C-5 Receipt v2:** R2 replay: no control reported `failed` due to a pre-existing failure; catch rate ≥ 5/7 runnable; tree-safety test (RE-10); one markdown renderer shared by the receipt and `action/render-comment.mjs` (GA-8).
- **C-6 Prepare eval:** build `scripts/bench/prepare-eval.ts`; E0 recorded in Phase 0 before any ranking change; every ranking change merges only if recall@pack ≥ E0 − 1 and top-3 doesn't drop (§9.7).
- **C-7 Envelope v2:** footer in every receipt with edits; `prism envelope` equals a hand count on a recorded session (EN-6); over-budget alarm fires on `knowledge_graph` without limit (EN-7); privacy schema test (no source text, no prompt text beyond a 64-char hash prefix) passes.
- **C-8 Daemon latency at 10k:** auto-Prepare p95 ≤ 300 ms at 1k (met: 53 ms) and ≤ 1.0 s at 10k (from 1.7 s); symbol answer after an edit ≤ 1.0 s p95 at 10k (from 2.3 s). Measured by `scripts/bench/daemon-freshness.mjs` (B5).
- **C-9 Graph tool:** answers the five orientation questions (B1, minus health) within the budgets in `budgets.json`; `graph.json` export schema-tested; no-network test green.
- **C-10 First run:** `prism` with no args on a 5k-file repo prints the one-line result in ≤ 20 s (T6). Test: CLI-5.
- **C-11 Real-agent proof:** rerun B6 after Phase 8 on Claude Code and opencode (and Codex CLI if configured) with the same 11 tasks plus 10 new ones, each in both arms with 3 runs. Publish whatever it shows, including negative results and skipped clients.
- **C-12 Deletion:** §0.4 done; package count and lines removed reported.
- **C-13 Docs and claims:** every public number links to a B-benchmark report; copy test green.
- **C-14 Budgets file:** deleted ops removed; new ops added with ceilings at about 2× the Phase 0 baseline.

---
## 1. Targets
| ID | Target | Goal |
|---|---|---|
| T1 | Clean install success, per (OS × editor) | ≥ 98% macOS/Linux, ≥ 95% Windows (Windows becomes required in CI) |
| T2 | Prompt hook wall time, warm | p50 ≤ 400 ms, p95 ≤ 1.5 s, hard cap 4 s (fail open) |
| T3 | Edit hooks (Pre/Post tool use) | p95 ≤ 150 ms |
| T4 | Structural receipt | p95 ≤ 3 s warm, ≤ 10 s cold; 0 timeouts in the benchmark |
| T5 | Freshness: a file save shows up in tool answers | p95 ≤ 2 s. Branch switch on 5k files ≤ 15 s |
| T6 | Cold first index, 5k TS files | ≤ 20 s |
| T7 | Prepare top-3 hit rate (golden + held-out) | ≥ 85% (TS/JS only; other languages are unsupported in 2.0) |
| T8 | Test-impact precision / recall | ≥ 0.80 / ≥ 0.90 on TS/JS |
| T9 | Blast precision (code list) | ≥ 0.85, with no barrel fan-out |
| T10 | Silent failures | 0 hook or daemon runs without an event saying `ok`, `skipped`, `degraded` or `error` with a reason |

---
## 2. Architecture changes everything depends on

### 2.1 Process model
- **One daemon per user** (`~/.prism/daemon/daemon.json`, lock as today, `daemon/src/server.ts:129-185`) owns indexing, watching, Prepare, the receipt, session baselines and lens choice. The MCP server, hook, CLI and Action are all clients.
- The MCP server ensures the daemon is running before its first tool call (P§1). The hook can start it too, but never relies on being the only starter.
- **Fallback when there's no daemon** (the CLI in CI, or the daemon can't start): the client runs the same core code in-process with the same contract. It sets `mode:"inproc"` in the output and logs an event.

### 2.2 Server-binary resolution for hooks (fixes R-A1, R-A2)
`resolvePrismBin()` is shared by the hook, CLI and installer. It checks, in order:
1. `PRISM_MCP_BIN`
2. `~/.prism/install.json` → `bin` (written by `prism install`)
3. `prism-mcp` on PATH
4. The pack-relative sibling paths (today's `prism-hook.mjs:236-246`), dev only.

Hooks **never** call `npx`. If nothing resolves, the hook emits `{}`, logs `install.missing_bin`, and `prism doctor` shows the fix.

### 2.3 Pinning and offline (R-A3)
- Generated MCP configs pin `@repo-prism/mcp-server@^<major>`, not `--prefer-online @latest`.
- `auto-update.ts`: a background check, cached for 24 h in `~/.prism/update.json`. It never blocks startup and never re-launches mid-session. It only prints "update available: run `prism upgrade`". Comparisons use real semver with prerelease ordering.
- With no network, everything except `prism upgrade` works. Proxy settings: honour `HTTPS_PROXY` and `NODE_USE_SYSTEM_CA` (already set in `dist/pack/mcp.json`).

### 2.4 Index identity and freshness (R-C7, R-C8, R-D3)
- Every snapshot and index carries `{schemaVersion, buildId, headSha, branch, generation, indexedAt}`.
- Readers (hook, tools, receipt) compare `headSha` with the current `git rev-parse HEAD`. On a mismatch, the answer is marked `stale:true` and a reindex is queued. Hooks stay **silent** on stale data rather than giving a wrong fact.
- **Watcher:** `fs.watch` recursive with ignores at the watcher level (`.git/objects`, `node_modules`, `dist`, `build`, `.next`, `coverage`, `.prism`, plus `.gitignore`). On an `error` or `EMFILE`/`ENOSPC` event, switch to polling (`git status` every 2 s) and log `watch.fallback`.
- **Branch switch:** a change to `.git/HEAD` (or a reflog entry) triggers one batched reindex. The individual events in that burst are dropped.
- **Schema:** an unknown or old `schemaVersion` gets a rebuild in the background. Old data is never read.
- **Corrupt files** (snapshot or SQLite) go to `*.corrupt-<ts>` and are rebuilt, with an `index.corrupt` event logged.

### 2.5 Event log and failure accounting (R-C12, R-C13)
- `~/.prism/events.jsonl`, rotated at 5 MB × 3, never sent anywhere. One line per hook, tool, daemon or receipt action: `{ts, event, sessionId, workspaceKey, build, client, durMs, outcome: ok|skipped|degraded|error, reason}`. It replaces `hook-log`.
- **Every `catch {}` in the hook, daemon and snapshot code emits a `degraded` event** (lint rule `no-silent-catch`).
- Agent-facing errors are fixed codes with one friendly sentence (`PRISM_NOT_READY`, `PRISM_NO_GIT`, `PRISM_TIMEOUT`, …). stderr is never passed through to the agent (R-C4).

### 2.6 Workspace resolution (R-C10)
The workspace is the git root of, in order: the file being edited, then the host's `cwd`/`workspace_roots`, then `PRISM_WORKSPACE`. The winning candidate and its source are logged. Folders inside a monorepo map to the root workspace, with `packageId` set.

---
## 3. Install, upgrade, uninstall

### 3.0 Local-build-only development (until 2.0.0)
- **Nothing is pushed or published before 2.0.0:** no `npm publish`, no git tags, no Action tag, no `git push`. CI workflows that publish (`.github/workflows/publish-npm.yml`; `publish-extension.yml` is deleted with the extensions, Decision 27) are disabled on the branch (`if: false`) until §10 "Release 2.0.0".
- **Every install, test, A/B run, install-matrix cell and harness run uses the local build of `/Users/shaileshjha/Prism`:**
  - `prism install <editor> --local /Users/shaileshjha/Prism`, or `bun run dev:link` (M-089). Writes MCP configs with `command: node` and the absolute path `…/packages/mcp-server/dist/bin.js`, never `npx @repo-prism/...`.
  - Hook `bin` comes from `install.json` → that absolute path. The plugin is installed from `packages/plugin/dist/pack` by local path (Claude Code `--plugin-dir` / local marketplace).
  - CLI via `bun link` or `node …/packages/cli/dist/cli.js`.
- **Clean-machine and CI cells** get the local build as packed tarballs (`npm pack` of each package, output to `dist/tarballs/`, not published), installed with `npm install <file.tgz>` or `file:` paths. Same bytes as the release candidate, no registry.
- **The Action** is used in tests as `uses: ./action` with `prism-command: node packages/cli/dist/cli.js` (as `.github/workflows/prism-review.yml` already does).
- **Contract check `no-published-refs`:** `prism doctor` (dev mode, on by default before 2.0.0) and a CI contract test fail if any MCP config, hook config, plugin manifest (`dist/pack/mcp.json`), Action input, A/B config or test fixture references `@repo-prism/*` from the registry (`npx`, `@latest`, a version spec, `bunx`) instead of a local path or `file:` tarball. Rows DEV-1…3.

| ID | Setup | Expected | Pass |
|---|---|---|---|
| DEV-1 | Cursor `.cursor/mcp.json` points at `npx -y @repo-prism/mcp-server@latest` | `prism doctor` fails "published package referenced during development"; `--fix` rewrites it to the local bin | exit code + file diff |
| DEV-2 | built `dist/pack/mcp.json` contains `npx … @repo-prism/mcp-server` | `no-published-refs` contract test fails the PR | CI |
| DEV-3 | A/B, install-matrix or harness run started | the run log records the resolved bin path and its git sha = the local tree; a registry path aborts the run | log check |

### 3.1 `prism install <claude|cursor|codex|opencode|all> [--project|--user]`
| Editor | MCP config written | Hooks | Skills/commands | Receipt path |
|---|---|---|---|---|
| Claude Code | `claude mcp add` equivalent (user or project) | the plugin pack's `hooks.json` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) | the pack's `skills/`, `commands/` | Stop hook |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json`. It must be the file both the IDE and `cursor-agent` read (P§1) | `.cursor/hooks.json`: `beforeSubmitPrompt`, `beforeReadFile`/`afterFileEdit`, `stop`. Today the plugin manifest has none (R-A4) | `.cursor/rules/prism.mdc` + `.cursor-plugin` skills | **Official:** the rule line in `.cursor/rules/prism.mdc` telling the agent to call `receipt` (§5.10). A `stop` hook, where available, is extra |
| Codex | `~/.codex/config.toml` `[mcp_servers.prism]` (with `receipt` enabled) | none | `AGENTS.md` block "Prism" (managed markers) | **Official:** the `AGENTS.md` rule line (§5.10) |
| opencode | `opencode.json` `mcp.prism` (user or project, no absolute dev paths, R-A5) | opencode plugin events (`chat.message`, `tool.execute.before/after`, `session.idle`) through a small `@repo-prism/opencode-plugin` shim | `AGENTS.md` block | `session.idle`, or the rule |

Install writes `~/.prism/install.json` `{bin, version, editors[], files[]}`. That record is what uninstall uses (§3.3).

- Node floor: **24 LTS**, enforced through `engines` (`>=24`) and checked by `doctor`.
- The native module (`better-sqlite3`) uses a prebuild. If it's missing, `doctor` prints the exact remedy (R-A7).
- The plugin is also published to the Claude Code plugin marketplace. No `bun run build` is needed for users (R-A6).
- Pack builds are atomic: write next to the old pack, then rename (P§1).

**Acceptance:**
- In a clean container or VM per row, `prism install X` followed by a scripted change prompt passes check S-INS-1…4 (§9.2).
- Uninstall afterwards leaves zero Prism files outside the user's repo (§3.3).

### 3.1a Installing over 1.x data in `~/.prism`
**Contract (part of `prism install`, runs before anything else):**
- **Detect 1.x:** `~/.prism` exists and either `~/.prism/version.json` is missing or has `major < 2`, or it contains 1.x markers (`workspaces/*/` without `schemaVersion`, `daemon/daemon.json` without `buildId` v2, a `hub/` folder, `hook-log`, `prepare-history.json`).
- **Stop first:** any running 1.x daemon or hub (from its record, verified over HTTP; otherwise left alone and reported).
- **Kept,** only if valid 2.0:
  - `~/.prism/lenses/*.json`: user-authored custom lenses that pass 2.0 lens schema validation (id, name, role, focus, checklist, `checks[]` ⊂ known check ids, `evidence[]` ⊂ `LENS_EVIDENCE`, `triggers[]` valid per §5.3), including their remembered overrules.
  - `~/.prism/config.json`: kept only if it parses and every key is a 2.0 key. Otherwise the 2.0-valid keys are kept and the rest are dropped.
  - Built-in lenses are re-seeded (shipped text, or the owner-renamed name if it passes validation).
- **Removed (moved to the trash, never hand-edited):**
  - every `workspaces/*` (indexes, snapshots, receipts, Envelope ledgers, session files)
  - `daemon/`, `hub/`, `dispatch/`, `hook-log`, `prepare-history.json`, `update.json`, `consent.json` files (re-asked in 2.0)
  - invalid custom lenses
  - invalid config keys
  - anything else unknown

  Invalid lenses are not deleted outright: they go to `~/.prism/.removed-1x-<ts>/` with a `REMOVED.txt` listing why each failed. That folder stays until `prism uninstall --purge`; the summary line names it.
- **Write** `~/.prism/version.json {major:2, installedAt}`.
- **Print exactly one line,** for example: `Prism 2.0: cleared 1.x data (12 workspace indexes, daemon, hub); kept 3 custom lenses and config; 1 lens not 2.0-compatible moved to ~/.prism/.removed-1x-20261014/.` Also logged as an `install.wipe_1x` event.
- **Idempotent:** with `version.json` major 2 present, nothing is wiped and no line is printed.
- **Partial or corrupt `~/.prism`** (unreadable JSON, a half-deleted folder, wrong permissions, a symlinked folder): treated as 1.x. Unreadable lens files count as invalid and are moved. Symlinks are removed, not followed. A permission error stops the install with the exact path and fix (`chmod`/`chown` hint). It never silently leaves mixed data.
- In-repo `.prism/` folders (1.x index caches) are not touched by install. They're ignored by 2.0 (schema mismatch → rebuild, §2.4) and removed by `prism uninstall --purge`.

| ID | Setup | Action | Expected | Pass |
|---|---|---|---|---|
| WIPE-1 | dirty 1.x `~/.prism`: 3 workspaces, live 1.x daemon, hub, hook-log, no `version.json` | `prism install claude` | 1.x daemon/hub stopped; all derived data gone; `version.json` major 2; exactly one summary line; `install.wipe_1x` event | fs snapshot diff + stdout line count = 1 |
| WIPE-2 | 1.x home with 2 valid custom lenses (one with an overrule) + 1 lens with an unknown check id + a renamed built-in "Prism Architect" | `prism install` | 2 valid lenses kept byte-identical (incl. overrule); invalid lens in `.removed-1x-*` with its reason; "Prism Architect" name kept | fs check + `prism lens list` |
| WIPE-3 | config with 2.0 keys + `PRISM_HUB`-era keys | `prism install` | 2.0 keys kept; old keys dropped and named in the summary line | JSON diff |
| WIPE-4 | after WIPE-1 | run `prism install` again | no wipe, no line, exit 0; lenses untouched | stdout empty of wipe line; fs unchanged |
| WIPE-5 | partial: `workspaces/` half-deleted, `lenses/a.json` truncated JSON, `daemon/daemon.json` garbage | `prism install` | treated as 1.x; truncated lens moved as invalid; rest wiped; install succeeds | fs + exit 0 |
| WIPE-6 | `~/.prism/workspaces` is a symlink to another disk | `prism install` | symlink removed, target untouched | target dir unchanged |
| WIPE-7 | `~/.prism/lenses` owned by root (permission denied) | `prism install` | stops with exit 3, names the path and the fix; nothing half-wiped | exit code + fs unchanged |
| WIPE-8 | clean machine, no `~/.prism` | `prism install` | no wipe line; `version.json` created | stdout |

### 3.2 Upgrade within 2.x (R-D1, R-D2, P§9). 1.x is never migrated; see §3.1a
- Versions move together for every published package (changesets). The publish job fails if any package would be skipped while its source differs from the published tarball (fixes `scripts/check-publish-exports.mjs`, which today ignores skipped packages).
- `prism upgrade` updates the bin, rewrites the editor configs to the new major pin, and restarts the daemon. If the daemon `buildId` doesn't match, it drains and restarts within 5 s. A client with a different build never "fights" the daemon: the newer client asks the older daemon to hand over.
- The hook and server check each other's version on every spawn: `hookVersion` vs `serverVersion`. A mismatch makes the hooks silent, fails `doctor` with "version mismatch", and logs `version.skew`. `prism install --local` fixes it (COV-71). No cross-version support.

### 3.3 `prism uninstall [--purge]`
Stops the daemon (and any leftover dispatch hub), removes the entries from every editor config listed in `install.json` (managed markers only), and removes the pack. `--purge` also deletes `~/.prism` and the repo `.prism/`. There's a docs page for it (R-D4).

---
## 4. Engine correctness (precision)

### 4.1 Resolver (P§3)
- **Contract:** every import specifier is resolved, in this order: relative → `package.json` `imports`/`exports` (conditions `types`, `import`, `require`, `default`) → tsconfig/jsconfig `paths` + `baseUrl` (including `extends`) → a workspace package's `exports`. Each edge records `{from, to, specifier, kind: value|type, resolvedBy}`. Unresolved imports are counted per package and sampled.
- **Cycles:** value edges only by default. `includeTypes:true` adds type edges.
- **Folders:** `explain_area` on a folder aggregates its files' edges.
- **DNA:** frameworks only count when actually imported by app code (hono's JSX ≠ React).
- **Acceptance:** rentmaadi `@/lib/dateUtils` → 3 page importers; Prism repo `tools/lenses.ts` → `@repo-prism/shared/lens-store` edge; hono `types.ts` type loop not reported; `explain_area src/middleware/cors` names the middleware and its test.

### 4.2 Symbol-level blast (P§4)
- **Contract:** `affected.code` = files that import a symbol defined in the target, or a symbol whose body reaches one, within the hop limit (default 3). Importing a barrel for a *different* export doesn't count. `affected.config` = pattern matches (tsconfig `include`, CI globs), labelled `pattern` and **excluded from risk**. Risk band = f(code dependents, public-API exposure, test reach).
- **Acceptance:** es-toolkit `debounce` → compat wrapper + `throttle` + the debounce specs (not 353 files); hono cors → its test; rentmaadi `dateUtils.ts` → 3 pages.

### 4.3 Test impact (P§4)
Same symbol walk. A test counts only if it imports the changed symbol or a symbol that reaches it. Output: `tests[] {path, reason, viaSymbol}`, plus `runCommand` when the runner is known (vitest, jest, bun, node:test, mocha).

### 4.4 Orphans and entry points (what's kept of P§5)
- **Entry points:** `package.json` `main`/`bin`/`exports`, framework routes (Next `app/` and `pages/`), files referenced by a literal path string (`/sw.js`), and test files.
- **Orphan:** a source file with no importers and no entry role. Config files, lockfiles, vendored SDKs and `pkg:` ids are never "source".
- Used by `safe_delete` and `list_findings`.

### 4.5 `graph find` dedupe (P§4)
One row per declaration, with its line. A re-export points to the defining file.

### 4.6 Languages (2.0 supports TypeScript and JavaScript only)
- **TS/JS** (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`): full support.
- **Everything else** is unsupported. Files are listed in inventory, but nothing more. Every tool answer about an unsupported file, or a repo where under 20% of source files are TS/JS, returns `PRISM_UNSUPPORTED (reason: language)`: "Prism 2.0 supports TypeScript and JavaScript only. <lang> files are not analysed." No guessed blast, tests or pack.
- Mixed repos: TS/JS files are analysed normally. Non-TS/JS targets get the error.
- The prompt hook does **not** inject for unsupported repos or targets. Instead it injects one line, once per session: "Prism: this repository's language is not supported in 2.0; no pack." (§5.8 H-PROMPT)
- Tested by LANG-1…4 (§5.12).

---
## 5. Feature contracts, acceptance criteria and test matrices

### 5.0 Conventions
- **Golden repos:** `hono` (TS lib), `preact` (JS), `es-toolkit` (TS utils), `rentmaadi` (Next app with `@/` aliases), `portpilot` = `Shailesh200/PortPilot` (public, MIT; Electron 40 + electron-vite, React 19, zustand, Tailwind, bun; `src/main` / `src/renderer` / `src/shared` with IPC between them; three tsconfigs `tsconfig.json`/`.node.json`/`.web.json`), pinned to `bf153b8` (v1.0.28), `mono` = **this Prism repo pinned to a commit after the 2.0 deletions (§0.4)** (`GOLDEN_MONO_SHA` in `scripts/e2e-agent/repos.json`; re-pinned once Phase 1 lands). Unsupported-language fixtures (not golden): `httpie/cli` (Python), `spf13/cobra` (Go), `BurntSushi/ripgrep` (Rust). They're used only for LANG rows.
- **Clients:** CC = Claude Code, CU = Cursor (IDE + `cursor-agent`), CX = Codex CLI, OC = opencode.
- **"Verify"** means one of three checks against the transcript harness (§9.4): **[T]** the tool calls and arguments in the transcript, **[O]** the tool or hook output JSON, **[E]** events in `events.jsonl`.
- **"All 4"** means the scenario runs once per client. A client with no hook API runs the rule-driven path, and "pass" is defined for that path.

### 5.1 MCP tools (default set)

#### `prepare_change`
**Contract:**
- **Input:** `{task: string, paths?: string[], budget?: number (default 2000)}`.
- **Output:** `{files[] (source only, ranked, each {path, why[], score}), tests[], reuse[] {symbol, path, evidence}, houseStyle[] {patternId, path}, notes[] (remembered facts, ADR rationale), order {inScope[], offLimits[], needsSignOff[]}, lens {id, procedure}, tokenEstimate, budget, stale, coverage}`.

**Ranking** (P§2):
- Per-index IDF over path tokens and symbol names. Rare tokens seed the pack, and their import-neighbours follow by import distance. Import distance outranks recency and ownership.
- Tests are only added after their source, and go in `tests[]`.
- No keyword lists and no special cases for a particular repo.

**Budget:**
- A fixed reserve of 15% for reuse, 10% for houseStyle and 10% for order. The file list is cut first.
- `tokenEstimate ≤ budget` **always** (a hard cap; a property test checks it).
- Each section keeps its best item first.

**Acceptance:** the P§0 rows. Reuse on rentmaadi includes `getNextRentDueDate` when it exists. Never over budget.

| ID | Repo | Prompt | Expected | Verify / pass |
|---|---|---|---|---|
| PC-1 | hono | "add a `maxAge` option to the cors middleware" | `files[0]=src/middleware/cors/index.ts`, `tests` has `cors/index.test.ts` and no other middleware tests | [O] files[0] exact; tests set equals expected |
| PC-2 | es-toolkit | "trailing debounce call should use the latest arguments" | `src/function/debounce.ts` first, `debounce.spec.ts` in tests | [O] top-1 |
| PC-3 | rentmaadi | "on the due day the tenant dashboard shows next month" | `apps/web/src/lib/dateUtils.ts` top-1; reuse has the rent-due helpers | [O] top-1 and reuse contains the helper |
| PC-4 | preact | "hydration mismatch between server and client text" | `src/render.js` in top-3; `demo/zustand.jsx` absent | [O] |
| PC-5 | rentmaadi | "rename formatDate to formatDisplayDate across the app" | the defining file top-1, importers in files, order.needsSignOff lists the shared util if high-blast | [O] |
| PC-6 | mono (Prism) | "add a timeout option to the daemon client's requests" | `packages/daemon/src/client.ts` top-3, files scoped to that `packageId` | [O] |
| PC-7 | py (unsupported) | "make --timeout accept fractional seconds" | `PRISM_UNSUPPORTED (reason: language)`; no files guessed | [O] |
| PC-9 | any | budget property: 200 random tasks | `tokenEstimate ≤ budget` in 200/200 | property test |
| PC-10 | hono | "where should I add a new `timing` middleware? follow the existing style" | houseStyle has an existing middleware as the exemplar; reuse is not empty | [O] |
| PC-11 | rentmaadi | (vendored or generated file) "fix the typo in the generated prisma client" | `order.offLimits` contains the generated path; the agent is told not to edit it | [O] |
| PP-1 | portpilot | "the next free port suggestion skips ports that are actually free" | `src/shared/next-free-port.ts` top-1; its tests in `tests[]` | [O] |
| PP-2 | portpilot | "add a new IPC call to rename a saved profile" | `src/shared/ipc.ts`, `src/main/ipc.ts`/`ipc-handle.ts`, `src/main/profiles-persistence.ts` in top-5; reuse names `atomic-json.ts` | [O] |
| PP-3 | portpilot | "what breaks if I change the IpcChannel types in src/shared/ipc.ts?" | blast spans main **and** renderer importers, each resolved with its own tsconfig (`.node` vs `.web`) | [O] |
| PP-4 | portpilot | "rename execFileSafe to runFileSafe" | `rename_impact` lists every main-process site; `bun run typecheck` passes after the edit | build |
| PP-5 | portpilot | edit `src/main/os/secure-store.ts` → stop | receipt names the tests that reach it, or `not_proven(untested)` | [O] |
| PP-6 | portpilot | `out/` and `build/` folders present | treated as generated/off-limits; never in a pack | [O] |
| PC-12 | held-out | 20% hidden tasks per repo | top-3 ≥ T7 | benchmark |

#### `blast_radius`
**Contract:**
- **Input:** `{target: path|symbol, hops?}`.
- **Output:** `{target, affected: {code[] {path, symbols[], hop}, config[] {path, pattern}}, tests[], risk: low|mid|high, publicApi: bool, breakingHints[], stale, coverage}`.
- Risk is computed from `code` only. Answers come in ≤ 300 ms warm.

**Acceptance:** §4.2.

| ID | Repo | Prompt / call | Expected | Pass |
|---|---|---|---|---|
| BR-1 | es-toolkit | "what breaks if I change debounce?" | code = compat debounce + throttle; tests = debounce specs; no `nth.spec.ts` | [O] set match |
| BR-2 | rentmaadi | "is it safe to change getNextRentDueDate's return type?" | 3 pages + their tests; risk ≥ mid; breakingHints names the signature change | [O] |
| BR-3 | hono | "what does editing src/compose.ts affect?" | `hono-base.ts` chain; config list separate; risk not inflated by tsconfig | [O] config not counted |
| BR-4 | preact | "what depends on `options` in src/options.js" | symbol reach, not every importer of `src/index.js` | [O] |
| BR-5 | mono (Prism) | "what breaks if I change the `ok()` result helper in @repo-prism/shared?" | dependents across packages, labelled by `packageId`; hop limit respected | [O] |
| BR-6 | go (unsupported) | "what breaks if I change Execute in command.go?" | `PRISM_UNSUPPORTED (reason: language)` | [O] |
| BR-7 | any | target outside the repo, `../../etc/passwd` | `PRISM_INVALID_PATH` | [O] |

#### `test_impact`
**Contract:** input `{target | paths[]}`. Output `{tests[] {path, viaSymbol, reason}, runCommand?, runner?, unknownRunner?:true}`. It never runs tests.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| TI-1 | es-toolkit | "which tests should I run after touching debounce?" | debounce specs only | precision 1.0 |
| TI-2 | hono | "which tests cover the cors middleware?" | `cors/index.test.ts` | [O] |
| TI-3 | rentmaadi | "what tests cover dateUtils?" | the existing tests, **or** `tests:[]` with "no test reaches this file" | [O] honest empty |
| TI-4 | mono (Prism) | "what tests cover lens-route.ts?" | `lens-route` tests in `packages/shared` | [O] |
| TI-6 | all golden | benchmark | precision ≥ 0.8, recall ≥ 0.9 | metrics |

#### `review_changes` (now carries ship's output)
**Contract:**
- **Input:** `{paths?, base?, lens?: architect|dev|qa|<custom>, format?: json|prDescription}`.
- **Output:** `{paths[] (was changed_paths), perPath[] {blast, tests, hints}, risk, lensFindings[] (§5.3), prDescription?: {whatChanged (from diff stats; the agent writes the prose), impact (areas affected, from code blast), verification {testsReaching[], untested[], lastReceipt?: {verdict, ranAt}}}}`.
- `verification` **never** claims a run Prism didn't see (from prism-ship step 3).
- **Large diffs:** above 300 paths, analyse the top 100 by risk and set `truncated:{total, analysed}`. The answer comes within 5 s.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| RC-1 | rentmaadi | "review my changes before I open a PR" (diff touches dateUtils) | 3 pages affected; risk ≥ mid; lens = architect | [T] called review_changes; [O] |
| RC-2 | hono | "write the PR description for this branch" | `prDescription.impact` names cors + test; verification lists tests reaching and states "not run in this session" when there's no receipt | [O] no fabricated pass |
| RC-3 | mono | "review this branch against origin/main" with 1,200 changed files (codemod) | `truncated` set, ≤ 5 s, top risks first | timing + [O] |
| RC-4 | any | clean tree, "review my changes" | `paths:[]`, message "nothing changed" | [O] |
| RC-5 | es-toolkit | "find bugs in this PR" | lens = qa (QA beats PR wording), findings cite paths | [O] |
| RC-6 | mixed (Prism + a .py script) | "review my changes" with one .ts and one .py file changed | .ts analysed; .py listed under `unsupported[]` with the message | [O] |

#### `safe_delete`
**Contract:** `{target}` → `{safe: bool, blockers[] {path, symbol, line}, orphansAfter[], entryRole?}`. A report only.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| SD-1 | rentmaadi | "can I delete public/sw.js?" | not safe: referenced by a literal path (entry role) | [O] |
| SD-2 | es-toolkit | "delete the unused `compat/_internal` helper if nothing uses it" | blockers listed or safe:true with no orphans | [O] matches grep+resolver truth |
| SD-3 | hono | "remove the deprecated `getPath` export" | blockers include re-exports through barrels | [O] |
| SD-4 | mono (Prism, post-deletion) | "can I delete packages/test-support?" | blockers listed per importing package (its test importers) | [O] |

#### `rename_impact`
**Contract:** `{target, newName}` → `{editSites[] {path, line, kind: decl|import|reexport|ref|string?}, publicApi, breakingHints}`. String matches are flagged, not counted.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| RN-1 | rentmaadi | "rename formatDate to formatDisplayDate across the app" | every import and call site including the `@/` alias; 0 missed vs `tsc` after rename | apply edits in the harness sandbox → `tsc --noEmit` passes |
| RN-2 | hono | "rename `HonoRequest` to `Request2`" | public API = true, breaking hint | [O] |
| RN-3 | preact | "rename `diff` in src/diff/index.js to `reconcile`" | internal sites, re-export from `src/index.js` | [O] |

#### `guard_session`
**Contract:** `{}` → `{changed[] (this session only: working tree minus the session baseline from the daemon), ranked by risk, untested[], outsidePack[], baseline: {sessionId, source: daemon|wholeTree}}`.

| ID | Repo | Prompt / setup | Expected | Pass |
|---|---|---|---|---|
| GS-1 | rentmaadi | 3 files were already dirty at session start; the agent edits dateUtils | only dateUtils is listed | [O] baseline.source=daemon |
| GS-2 | mono | 40k-file repo (the baseline git command takes > 2 s) | baseline still correct (computed by the daemon, no 2 s timeout, R-C9) | [O] |
| GS-3 | any | "what did I change that has no tests?" | `untested[]` accurate | [O] |

#### `repository_overview` (absorbs dna, stack, landmarks; no health)
**Contract:** `{}` → `{languages, frameworks (only if imported), packageManager(s), packages[] (top N), landmarks[], entryPoints[], unresolvedImports {count, sample}, coverage, indexedAt, stale}`.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| RO-1 | hono | "what is this repository?" | TS library, no React | [O] |
| RO-2 | mono | "give me the lay of the land in this monorepo" | packages with roots; ≤ 1,500 tokens | [O] size |
| RO-3 | rust (unsupported) | "what is this project built with?" | languages listed from inventory; `supported:false` + the 2.0 message; no frameworks guessed | [O] |

#### `graph` (absorbs find_symbol, search_symbols, find_references, dependency_route)
**Contract:** `{mode: find|search|refs|neighbors|path|explain, name|path, direction?: in|out|both, maxHops?, kind?}` (modes match `tools/graph.ts`; see Appendix A.1). `find` returns one row per declaration with its line. `refs` returns resolved references (aliases and re-exports). `route` returns paths and alternatives. The output is bounded (≤ 50 rows) with `truncated`.

| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| GR-1 | hono | "how does src/hono.ts reach src/compose.ts?" | the existing path is kept (P§0) | [O] |
| GR-2 | hono | "where is parseBody defined?" | one row per real declaration, with lines; `src/utils/body.ts` | [O] |
| GR-3 | rentmaadi | "who calls getNextRentDueDate?" | refs through the `@/` alias | [O] |
| GR-4 | any | "find anything named like *Token*" | search mode, ≤ 50 | [O] |
| GR-5 | any | deleted name `find_symbol` called (e.g. from an old skill) | standard MCP unknown-tool error; `tools/list` never contains it | [O] |

### 5.2 Opt-in tools
Each one keeps its existing contract, and gets one smoke scenario per golden TS repo:
- `dependency_graph`, `knowledge_graph` (requires a path or limit), `dependency_cycles` (value edges)
- `list_packages`, `explain_area` (folder aggregation, §4.1), `explore_code`
- `list_findings`: duplicates are matching bodies, not re-exports (P§6)
- `agents_md`: Living AGENTS.md. `verify` mode runs in CI
- `workspace_status`, `capabilities`
- `review_with` (brief/record), `receipt` (§5.10)

| ID | Prompt | Expected |
|---|---|---|
| OPT-1 | (hono) "list import cycles" | the `types.ts` type loop is absent |
| OPT-2 | (hono) "find duplicated code" | the `template` re-export is not a duplicate |
| OPT-3 | (any) "is the Living AGENTS.md up to date?" | `agents_md {mode:"check"}` reports drift precisely |
| OPT-4 | (mono) "explain what packages/api does" | folder aggregation, not "no edges" |

### 5.3 Lenses

#### Built-in lenses: Architect, Dev, QA
**Contract (changed from today):**
- **Choice:** `chooseLens(task, lenses)` (`shared/lens-route.ts:34`):
  1. A lens named in the task wins, including custom ones.
  2. Otherwise a QA pattern ("find bugs", "why does X fail") wins.
  3. Otherwise Architect for "review" + (PR | pull request | this change | before I open a PR), a new feature, or a plan.
  4. Otherwise Dev.
  - The phrases are added to the existing patterns, with no synonym table (P§6).
- **Delivery:** the **hook** injects `{lens.id, procedure}` once (the prompt hook, or the rule on hookless clients). The skill `prism-lens` describes this behaviour and **names no tool outside the default set**.
- **Data-backed checks** (new): each lens has `checks[]` that Prism *computes*. They appear in `review_changes.lensFindings` and in the receipt as `pass|concern|fail` with evidence:
  - **Architect:** `new_cross_package_edge`, `new_value_cycle`, `off_limits_touched`.
  - **Dev:** `reuse_missed` (a new function or export whose body or signature matches an existing helper), `new_dependency_added` (package.json diff), `untested_new_branch` (changed function with no test reach).
  - **QA:** `untested_changed_symbol`, `dependents_not_in_diff` (callers of the changed signature that weren't edited), `test_reaches_but_not_run` (from the receipt).
- **Evidence follows the task:** for a PR or working-tree request, the changed files; otherwise the top of the Prepare pack (P§6). It is never "whatever is dirty".
- **Upgrade safety:** never rename a lens the owner renamed. Fill an empty `procedure`. Replace the role or checklist only when it still equals the shipped text *and* the name still equals the shipped name (P§6).
- **Storage:** built-in and custom lenses live only in `~/.prism/lenses` (global, per user, outside every repo). Prism never reads or writes lens files in a repository.

**Acceptance:** the 3 lens rows of P§0, on a fresh home and on a renamed-lens home. Checks are reproducible from the index alone. No model is called.

| ID | Repo | Prompt | Expected lens and checks | Pass |
|---|---|---|---|---|
| LN-1 | any | "review this PR" | architect; evidence = changed files | [O] |
| LN-2 | any | "review the uncommitted change before I open a PR" | architect | [O] |
| LN-3 | es-toolkit | "find bugs in debounce" (other files dirty) | qa; evidence = debounce, not the dirty files | [O] |
| LN-4 | any | "find bugs in this PR" | qa | [O] |
| LN-5 | rentmaadi | "fix the due date bug" | dev | [O] |
| LN-6 | mono | diff adds `import` from `packages/web` into `packages/core` | architect `new_cross_package_edge` = fail with the edge named | [O] |
| LN-7 | hono | diff adds a value import cycle | `new_value_cycle` = fail; a type-only cycle → pass | [O] |
| LN-8 | rentmaadi | diff adds `formatDueDate` that duplicates the existing `formatDate` body | dev `reuse_missed` = concern with the path | [O] |
| LN-9 | es-toolkit | diff changes the `debounce` signature, `throttle` not edited | qa `dependents_not_in_diff` = fail | [O] |
| LN-10 | any | renamed-lens home ("Prism Architect"), then upgrade | name kept, empty procedure filled | file diff |
| LN-11 | any | "Ask the architect lens to look at this refactor" | architect (named) | [O] |
| LN-12 | any | non-English: "इस PR की समीक्षा करो" | no lens injected; English-only note (§5.11) | [O] |

#### Custom lenses and the remembered overrule
**Contract:**
- `prism lens add <id> --name --role --focus --checklist --checks <ids…> --evidence <LENS_EVIDENCE…> --trigger "<phrase>"…` (CLI). The MCP `lens` tool stays opt-in.
- **Choosing a custom lens:**
  - By name (id or display name) anywhere in the prompt.
  - **Or** when one of its `triggers[]` phrases appears. Triggers are case-insensitive whole-word phrase matches on the English prompt; at least 2 words, or 1 word of 6 or more letters (rejects "fix", "test"). Validated at `lens add` time, which refuses triggers that collide with built-in routing words ("review", "bug", "PR").
- **Order:** a named lens (earliest mention) wins over triggers. Triggers win over the built-in QA/Architect/Dev routing.
- **Conflicts:** several custom lenses triggered → the longest matching phrase wins. On a tie, the most recently edited lens wins, and `lensConflict:{candidates[]}` is put in the brief and logged as `lens.conflict`. The user can name one to override.
- Triggers never fire on text inside code blocks or quoted file contents in the prompt.
- **Overrule:** `prism lens override <reviewId> --note "…"` stores `{checkId, path or symbol fingerprint, note}` on the lens. The same check on the same fingerprint is reported as `overruled` (not fail) until the fingerprint changes (file content hash or symbol signature). Overrules appear in the brief as remembered notes.

| ID | Prompt / action | Expected | Pass |
|---|---|---|---|
| CL-1 | `prism lens add security --checks untested_changed_symbol,new_dependency_added --name "Security"`; prompt "review this with the security lens" | security lens chosen; its checks run | [O] |
| CL-2 | LN-8 overruled ("formatDueDate intentionally differs"); re-run review | `overruled` with the note; no fail | [O] |
| CL-3 | edit formatDueDate's body after the overrule | the fingerprint changed → check re-evaluated | [O] |
| CL-4 | remove a built-in lens | refused; custom lenses can be removed | [O] |
| CL-5 | custom lens referencing an unknown check id | `lens add` fails with the list of valid ids | CLI exit 2 |
| CL-6 | `prism lens add perf --trigger "slow query" --trigger "performance regression"`; prompt "the tenant list has a slow query, fix it" | perf lens (trigger), not dev | [O] lens.id=perf |
| CL-7 | false positive: same perf lens; prompt "the slow-query log rotation script crashes" | "slow query" whole-phrase matches → perf. Documented behaviour; the user can name "dev lens" to override, and that works | [O] |
| CL-8 | false positive guard: prompt contains a code block with `// slow query` | trigger ignored inside code; dev chosen | [O] |
| CL-9 | conflict: `perf` (trigger "slow query") and `db` (trigger "slow query on postgres"); prompt "fix the slow query on postgres in reports" | db (longer phrase); `lensConflict` lists both | [O][E] lens.conflict |
| CL-10 | conflict tie: two lenses with the trigger "payment flow" | most recently edited wins; conflict reported | [O] |
| CL-11 | named beats trigger: "use the security lens; there is a slow query too" | security | [O] |
| CL-12 | trigger beats built-in: perf lens; "find bugs causing the performance regression" | perf (trigger) over qa | [O] |
| CL-13 | invalid trigger: `--trigger fix` / `--trigger review` | refused (too short, or collides with built-in routing words), exit 2 | CLI |
| CL-14 | storage: `lens add` inside a repo | file written only under `~/.prism/lenses`; repo untouched (`git status` clean) | fs check |

### 5.4 Skills (plugin pack) and custom skills
The kept skills are `prism-onboard`, `prism-safe-change`, `prism-review-pr` and `prism-lens`. `prism-ship` is removed. Commands: `/prism-review`, `/prism-check`, `/prism-graph`.

**Contract:**
- Each skill names only default tools (contract test, §0.3).
- `prism-review-pr` step 4 = output `review_changes(format:"prDescription")`. Posting goes through the editor's own GitHub connector, only with user confirmation.
- `prism-lens` = a description of the injected lens. It has **no tool calls** other than optionally `review_changes(lens)`.
- **Custom skills:** a user skill in `.claude/skills/*`, `.cursor/skills/*`, or `~/.prism/skills/*` that names Prism tools gets checked by `prism doctor skills`: every tool it names must be registered (or in the opt-in set with full mode on). Otherwise it gets a warning with the fix. Prism never edits user skills.

| ID | Skill | Prompt | Client | Expected | Pass |
|---|---|---|---|---|---|
| SK-1 | onboard | "I just cloned this, what is it and where do I start?" | all 4 × hono, mono | `repository_overview` first, then landmarks/files | [T] first call; ≤ 3 calls |
| SK-2 | safe-change | "rename formatDate to formatDisplayDate across the app" | all 4 × rentmaadi | `rename_impact` before any edit; all sites edited; `tsc` passes | [T] order; build |
| SK-3 | safe-change | "delete the old `legacyAuth` helper" | CC, CU × mono | `safe_delete` before the delete; stops if there are blockers | [T] |
| SK-4 | review-pr | "review PR #42" (fixture PR in harness) | all 4 × rentmaadi | `review_changes` before opinion; findings cite blast | [T][O] |
| SK-5 | review-pr | "write the PR description" | all 4 × hono | `prDescription` used; no "tests passed" unless a receipt exists | [O] text check |
| SK-6 | lens | "find bugs in debounce" | all 4 × es-toolkit | follows QA procedure; no `review_with` call in default mode | [T] |
| SK-7 | custom | user skill calls `graph(find)` and `blast_radius` | CC | both resolve; `doctor skills` reports the skill as OK | [O] |
| SK-8 | custom | user skill calls a tool that isn't registered (e.g. a typo, `blast_radus`) | CC, CU | `doctor skills` warns "unknown tool" with the file path; the call gets the standard unknown-tool error | [O] |

### 5.5 Prepare sub-contracts
(Covered in `prepare_change` above.) Listed separately so each part has an owner:
- **Files:** IDF seed + import distance. Tests are separate. Source only.
- **Reuse:** symbols whose names or signatures match the task tokens or seeds, each with evidence. Never dropped to make room for unrelated routes.
- **House style:** 1–2 exemplars from the same folder or package kind.
- **Budget:** hard cap with reserves.
- **Work order:** `inScope`, `offLimits` (generated, vendored), `needsSignOff` (high blast, shared ownership). `offLimits` (generated or vendored) → the hook **denies** edits. `needsSignOff` → **warns only, always**; there is no setting to block (R-C6).
- **Stale:** if `stale:true`, Prepare still answers, marked, and the hook doesn't inject it.

### 5.6 Envelope
Fields today (`core/envelope/envelope-ledger.ts`, `budgets.ts`): `calls`, `chatCalls`, `byTool[] {tool, calls, tokens, tokenWeight}`, `buckets[]`, `budget`, `bytesKeptRatio`, `bytesKeptDeltaPp`, `followThrough`, `clientNames[]`, `clientVersions[]`, per-session `calls[] {tool, ts, tokens, query}`.

**Contract:**
- One ledger. Every MCP tool call and hook injection is appended `{ts, sessionId, client, tool|hook, tokensOut, overBudget, stale}`.
- `prism envelope [--session] [--json]` shows calls, tokens in, over-budget count, and per-tool rows.
- **saved:** `"not calibrated"` until the calibration study (§9.3) produces a factor per client. After that, `saved: {tokens, method:"calibrated-v1", ci95}`.
- `bytesKeptDeltaPp` is only printed together with the two ratios that produce it.
- Remove "Sent %" and "Not job tokens" (P§7).
- `followThrough` = the share of Prepare files the agent then opened or edited, computed from hook events. `unavailable` on hookless clients.

| ID | Scenario | Expected | Pass |
|---|---|---|---|
| EN-1 | CC rentmaadi "on the due day the tenant dashboard shows next month" | ledger row for the prompt-hook Prepare (P§0) | [O] `prism envelope --session` |
| EN-2 | 50 Prepare calls | overBudget = 0 | [O] |
| EN-3 | CU without hooks | the agent calls `prepare_change`; row has client=cursor; followThrough `unavailable` | [O] |
| EN-4 | before calibration | `saved:"not calibrated"`, no % shown | [O] |
| EN-6 | recorded CC session | `prism envelope` equals a hand count of the transcript's calls and tokens | exact |
| EN-7 | `knowledge_graph` with no limit (opt-in) | over-budget alarm fires once | [O] |
| EN-5 | two concurrent sessions | rows separated by sessionId | [O] |

### 5.7 Receipt
**Contract:**
- Produced by the **daemon** (`POST /v1/receipt {sessionId, root}`). Fallback is in-process on the CLI, never npx (R-B3).
- **Structural part** (≤ 3 s warm): `{changed[] (session only), dependents[], testsReaching[], untested[], lensFindings[], verdict}`.
- **Checks part** is asynchronous: run the scoped commands (`packages/checks`). Each command times out at 60 s, the total at 120 s, in the background. Results attach to the receipt id and are shown in the **next** stop, in `prism receipts`, and in `review_changes.verification`.
- **Verdict:**
  - `proven`: all reaching tests ran and passed.
  - `not_proven`: untested changes, or checks not run, with the reason (`no_node_modules`, `unknown_runner`, `skipped_offline`, `still_running`).
  - `failed`: a reaching check failed, with the first failure excerpt.
  - Never `unknown`.
- **Dedupe:** key `(sessionId, diffHash)`. A repeated stop returns the stored receipt (R-C3).
- Stop hook budget: 10 s hard. On timeout it emits nothing to the agent and logs `receipt.timeout`. The agent is **never** told "the receipt failed" with raw stderr (P§1, R-C4).
- Written to `~/.prism/workspaces/<key>/receipts/<id>.json`. `prism receipts` lists them.

| ID | Repo / setup | Prompt (CC) | Expected | Pass |
|---|---|---|---|---|
| RE-1 | rentmaadi, node_modules present | "on the due day the tenant dashboard shows next month" → agent edits dateUtils → stop | structural receipt ≤ 3 s; tests run async; next stop shows `proven` or `failed` | [O][E] timing |
| RE-2 | rentmaadi, **no node_modules** | same | `not_proven(no_node_modules)` ≤ 3 s; no timeout | [O] |
| RE-3 | any | agent stops twice in a turn | the second returns the same receipt id, no new spawn | [E] one `receipt.build` |
| RE-4 | hono | test command hangs (chaos) | structural receipt on time; checks `timeout` after 60 s; verdict `not_proven(timeout)` | [O] |
| RE-5 | mono (Prism) | "add a timeout option to the daemon client's requests" | vitest detected; tests scoped to `packages/daemon` | [O] |
| RE-6 | py (unsupported) | edit a .py file → stop | receipt lists the file under `unsupported[]`; verdict `not_proven(unsupported_language)` | [O] |
| RE-7 | CU, CX, OC | same as RE-1 | CU and CX: `receipt` called through the official rule line (RX-1/2). OC: the `session.idle` hook | [T]/[O] |
| RE-8 | mono, huge diff | codemod across 1,200 files → stop | structural ≤ 10 s, truncated; checks scoped to the top-risk packages | [O] |
| RE-10 | any | baseline check run during the receipt (M-092 tree-safety) | working tree, including untracked files, byte-identical after the run | hash before/after |
| RE-9 | any, daemon killed mid-session | stop | daemon restarted, or in-process fallback; receipt ≤ 10 s | [E] |

### 5.8 Hooks
All hooks: `PRISM_HOOKS=0` → `{}` and no work. Each run writes one event. Errors are never shown raw to the agent. Silent when not ready or stale.

#### H-SESSION (SessionStart / Cursor session / opencode session start)
**Contract:**
- Record the session baseline via the daemon (no 2 s git timeout).
- Ensure the daemon is running and the workspace is registered.
- If the snapshot is ready and fresh, inject `orientation` (≤ 300 tokens). Otherwise inject **nothing** ("warming" is removed, R-B1).
- Budget: 1 s.

#### H-PROMPT (UserPromptSubmit / Cursor beforeSubmitPrompt / opencode chat.message)
**Contract:**
- **Language:** English only. A prompt detected as mostly non-Latin script, or under 50% English stop-words (deterministic check), gets no pack and the one-line note (HK-4).
- **Classify** in the daemon with `looksLikeChangeRequest` (shared): an English change verb, **or** a symptom pattern ("shows X instead of Y", "breaks when", "bug", "doesn't work"), **or** a reference to a file or symbol in the repo plus imperative mood. Review requests go to the review path. Pure questions ("how does A reach B", "what is X") get no pack (P§1). `PRISM_AUTOPREPARE=auto|off` (`0` = off).
- **Wait** for daemon readiness for up to 3 s. Then Prepare with budget 1,200 for injection.
- **Inject:** files (top 5), tests, reuse (top 2), the lens id + procedure, and a one-line blast of the top file.
- On timeout: inject nothing and log `prompt.not_ready`. If the next prompt in the session is a change request, it retries.
- Hard cap 4 s.
- **Don't inject** when `stale`. Unsupported language → the one-line note (§4.6).

#### H-PRE-EDIT (PreToolUse Write|Edit|NotebookEdit / Cursor beforeFileEdit / opencode tool.execute.before)
**Contract:**
- Read the snapshot (≤ 150 ms).
- `offLimits` → deny with the reason.
- `needsSignOff` → warn; **never** blocks.
- File outside *this session's* pack (keyed by sessionId, R-C5) → one-line note "not in Prism's pack; check blast_radius".
- Not ready or stale → silent.

#### H-POST-EDIT
**Contract:** high-blast file → one line: "X is high-blast (N dependents); the receipt will say whether a test reaches it". Otherwise nothing. It also nudges the daemon to reindex the file (freshness T5).

#### H-STOP
**Contract:** §5.7. 10 s budget.

| ID | Hook | Prompt / setup | Client | Expected | Pass |
|---|---|---|---|---|---|
| HK-1 | prompt | "fix the due date on the tenant dashboard" | all 4 × rentmaadi | pack names `dateUtils.ts` before the first edit | [O] injected context; [T] first edit is dateUtils |
| HK-2 | prompt | "how does src/hono.ts reach src/compose.ts?" | all 4 × hono | no pack injected | [E] `prompt.question` |
| HK-3 | prompt | "the tenant dashboard shows next month on the due day" (no verb) | CC × rentmaadi | pack injected (symptom pattern) | [O] |
| HK-4 | prompt | "डैशबोर्ड पर due date गलत दिख रही है, ठीक करो" (Hindi) | all 4 × rentmaadi | no pack; one line once per session: "Prism understands English prompts only in 2.0; no pack added."; event `prompt.non_english` | [O][E] |
| HK-5 | prompt | "make it pretty" (vague) | CC × any | classifier `auto`: no files match strongly → no injection | [O] |
| HK-6 | prompt | cold start, first prompt 0.5 s after session start | CC × rentmaadi | waits ≤ 3 s, then injects | [E] `prompt.waited` < 3,000 |
| HK-7 | prompt | index takes 30 s (mono cold) | CC × mono | nothing at 3 s; the second change prompt injects | [E] |
| HK-8 | pre-edit | agent edits `prisma/generated/client.ts` | all 4 × rentmaadi | denied, with the reason | [O] |
| HK-9 | pre-edit | agent edits a high-blast shared util | all 4 | warn only; the edit goes through (never deny) | [O] no `permissionDecision` |
| HK-10 | pre-edit | index not ready | CC | silent | [O] `{}` |
| HK-11 | pre-edit | concurrent session B with a different task | CC ×2 | the outside-pack note uses B's own pack | [O] |
| HK-12 | post-edit | edits dateUtils | CC | high-blast line; reindex within 2 s | [E] |
| HK-13 | session | `PRISM_HOOKS=0` | all | no output, no daemon start | [E] none |
| HK-14 | all | installed from the marketplace (no monorepo siblings) | CC | the bin resolves via install.json; no "no local server" | [E] |

### 5.9 CLI (kept commands)
Existing: `doctor`, `index`, `prepare`, `remember`, `memories`, `forget`, `packages`, `data prune`, `completions`, `graph status|export`, `receipts`, `envelope`, `explain`, `explore`, `blast`, `review`, `safe-delete`, `rename`, `test-impact`, `deps`, `cycles`, `symbol`, `refs`, `route`, `findings`, `agents-md`. **New in 2.0:** `install`, `uninstall`, `upgrade`, `overview`, `lens`, `stats`. Full list: `doctor`, `index`, `install`, `uninstall`, `upgrade`, `overview`, `explain`, `explore`, `blast`, `review`, `safe-delete`, `rename`, `test-impact`, `deps`, `cycles`, `symbol`, `refs`, `route`, `receipts`, `envelope`, `lens`, `agents-md`, `findings`. Deleted: `health`, `engineering`, `testing`, `security`, `backend`, `bundle`, `map`, `dna`, `stack`, `features`, `landmarks`. Running one gets the standard "unknown command" error. Exit codes stay the same (0, 1, 2, 3). Every command takes `--json`.

| ID | Command | Expected |
|---|---|---|
| CLI-1 | `prism review --base origin/main --fail-on high` on rentmaadi with the dateUtils diff | output matches the Action comment and MCP `review_changes` (one definition) |
| CLI-2 | `prism blast src/function/debounce.ts --json` | equals BR-1 |
| CLI-3 | `prism receipts --last` | last receipt, verdict and checks |
| CLI-5 | `prism` with no args on a 5k-file fixture | one-line "indexed N files in T s" ≤ 20 s | timing |
| AB-1 | B6 on a machine with `codex` configured | 3 clients run; report has a row per client with CIs | report |
| AB-2 | B6 with no `codex` on PATH, or not logged in | CC and OC run; report says "Codex skipped: not configured"; `ab.skip` event | report + [E] |
| AB-3 | provider returns a quota/credit error at run N | stop at once; runs < N kept; report and the console say "stopped: quota/credits exhausted" | report |
| CLI-4 | `prism health` | standard unknown-command error (exit 2), no special hint |

### 5.10 `receipt` tool and the official rule path (Cursor, Codex)
**Contract:**
- `receipt {sessionId?}` returns the same as §5.7 and builds one if needed. Deduped by `(sessionId, diffHash)`.
- Default-on for Cursor and Codex installs (`prism install` adds `receipt` to `extraTools[]`), and opt-in elsewhere.
- **The official support path for Cursor and Codex** is the rule line `prism install` writes:
  - Cursor: `.cursor/rules/prism.mdc`, `alwaysApply: true`.
  - Codex: a managed `AGENTS.md` block.
  - Text: "Before you say a coding task is done, call the Prism `receipt` tool and report its verdict in one line."
  - The same rule also says: "Before editing, call `prepare_change` with the task." This replaces the prompt hook on these clients.
- `prism doctor` checks that the rule is present and unmodified (hash between the managed markers).

| ID | Client | Prompt | Expected | Pass |
|---|---|---|---|---|
| RX-1 | CU × rentmaadi | "fix the due date on the tenant dashboard" | `prepare_change` before the first edit; `receipt` called before the final answer; verdict quoted | [T] order; ≥ 2/3 runs |
| RX-2 | CX × hono | "add a maxAge option to the cors middleware" | same | [T] |
| RX-3 | CU × es-toolkit | "how does debounce work?" (question) | no `receipt` call (no edits) | [T] |
| RX-4 | CX | rule block deleted by the user | `doctor` reports "rule missing"; `doctor --fix` restores it | [O] |
| RX-5 | CU | the agent calls `receipt` twice | same receipt id | [O] |
| RX-6 | CX, no node_modules | edit, then `receipt` | `not_proven(no_node_modules)` ≤ 3 s | [O] |

### 5.11 Prompt classifier: coverage spec
A labelled corpus of **400 English prompts**: change requests 50%, review 15%, bug hunt 10%, questions 20%, chit-chat 5%. It's taken from the golden-repo tasks plus anonymised real transcripts. There's also a separate set of 40 non-English prompts. **Gate:** change-request recall ≥ 0.95, question false-positive rate ≤ 0.05, non-English → 100% "no pack + note" (never a wrong pack).

### 5.12 Unsupported languages
| ID | Repo | Prompt | Expected | Pass |
|---|---|---|---|---|
| LANG-1 | py (httpie) | "add a retry flag to downloads" (CC) | prompt hook: one-line unsupported note, no pack | [O] |
| LANG-2 | go (cobra) | `blast_radius command.go` | `PRISM_UNSUPPORTED (reason: language)` with the 2.0 message | [O] |
| LANG-3 | rust (ripgrep) | `prism review` in CI | exit 0, comment "language not supported in 2.0" | Action log |
| LANG-4 | Prism + a .py file | `test_impact scripts/x.py` | unsupported error; a .ts target in the same repo works | [O] |

### 5.13 Features in the code the plan didn't cover
**MCP prompts** (`packages/mcp-server/src/prompts.ts`: `orient`, `before_edit`, `review_diff`). Kept as thin slash-command entry points. Each prompt's text names only default tools: `orient` → `repository_overview`; `before_edit` → `prepare_change` + `blast_radius`; `review_diff` → `review_changes`. The job-runner prompts in that file's comment (`start_my_day`, `start_work`, `where_are_we`, `init`, `sleep`) belong to Dispatch and are deleted (§0.4).

| ID | Prompt | Expected | Pass |
|---|---|---|---|
| MP-1 | CC `/prism:orient` on hono | one `repository_overview` call | [T] |
| MP-2 | CC `/prism:before_edit src/function/debounce.ts` on es-toolkit | `prepare_change` then `blast_radius`, debounce first | [T][O] |
| MP-3 | CU `review_diff` with a rentmaadi diff | `review_changes`, 3 pages affected | [T][O] |

**MCP resources** (`packages/mcp-server/src/resources.ts`): keep only resources that read kept data (overview, last receipt). Delete health/map resources. Contract test: every resource URI resolves, and none references a deleted item.

**Memory / notes** (`prism remember`, CLI `commands/memory.ts`; shown as Prepare `notes[]`). **Contract:** `prism remember "<fact>" [--path p]` stores a fact in `~/.prism/workspaces/<key>/memory.json`. Prepare includes a fact only if its path or tokens match the task, in ≤ 10% of the budget. `prism remember --list/--forget <id>`. No migration of old memories.

| ID | Action | Expected | Pass |
|---|---|---|---|
| MEM-1 | `prism remember "rent is due on the 5th, not the 1st" --path apps/web/src/lib/dateUtils.ts`; prompt "fix the due date bug" | Prepare `notes[]` includes the fact | [O] |
| MEM-2 | unrelated prompt "add a maxAge option to cors" on the same repo | fact not included | [O] |
| MEM-3 | `prism remember --forget <id>` | gone from the next Prepare | [O] |

**`prism graph export`** (`commands/graph.ts`, M-096): `graph.json` with a documented schema (nodes, value/type edges, symbols). It's the only graph artifact in 2.0.

| ID | Action | Expected |
|---|---|---|
| GX-1 | `prism graph export` on hono | `graph.json` validates; value and type edges labelled |
| GX-2 | same under the no-network trap | zero network calls |
 

**`prism data prune`** (`commands/data-prune.ts`, C-3):

| ID | Action | Expected |
|---|---|---|
| PRUNE-1 | `prism data prune` (dry run) with 3 stale workspaces | lists 3, removes nothing |
| PRUNE-2 | `--yes` | removes only the listed ones; lenses and config untouched |
| PRUNE-3 | receipts > 20 in a workspace | oldest pruned, last 20 kept |

**`prism doctor`** (`commands/doctor.ts`, including the existing shallow-clone check):

| ID | Setup | Expected |
|---|---|---|
| DOC-1 | Cursor config re-pointed at `npx … @latest` | doctor fails "unpinned server" and `--fix` re-pins |
| DOC-2 | daemon killed | doctor shows "daemon not running"; `--fix` starts it |
| DOC-3 | shallow clone | existing warning kept |

**Completions** (`commands/completions.ts`): regenerated from the 2.0 command list; contract test: no deleted command appears.

**Consent** (`~/.prism/workspaces/<key>/consent.json`, `PRIVACY.md`): core makes no network calls (existing trap test). With health, reports and PageSpeed deleted, check which consent purposes remain; any purpose with no remaining feature is deleted (§0.4). The 1.x wipe re-asks.

---
## 6. GitHub Action (`action/`)
**Contract:**
- Runs `prism review` against the PR base, posts a sticky comment (code blast, tests, risk, lens findings, prDescription), and can upload SARIF.
- The receipt block is omitted in CI (no session). "No receipts yet" is not printed as an error (P§8).
- Same definitions as the CLI and MCP.

**Fixes:**
- Cache `PRISM_HOME` (set to `${{ runner.temp }}/prism`), not `./.prism` (R-E1, P§8).
- Detect the package manager from its lockfile. Don't force `setup-node cache: npm` (R-E2).
- Shallow clone: try `git fetch --deepen=200` and fetch the base ref before failing (R-E3).
- `version` defaults to the Action's own release (`v2` → `@repo-prism/cli@2`), not `latest` (R-E4).
- Released as `Shailesh200/prism/action@v2` (there is no v1), tagged only in the final Release 2.0.0 step. Docs and the README only reference `@v2` (R-E5). Before that, tests use `./action`.
- `node-version` default = `24`.

| ID | Repo | Setup | Expected | Pass |
|---|---|---|---|---|
| GA-1 | rentmaadi | PR changes dateUtils | comment lists 3 pages, risk ≥ mid; matches CLI-1 | diff of JSON |
| GA-2 | pnpm monorepo | no package-lock | the Action runs | job green |
| GA-3 | any | `fetch-depth: 1` | auto-deepen works, or a clear error | log |
| GA-4 | hono | second run | index cache hit, ≥ 50% faster | timing |
| GA-5 | any | `fail-on: high` with a high risk | exit 1, comment says why | job status |
| GA-6 | rust (unsupported) | PR | job green, comment says "language not supported in 2.0" | comment |
| GA-8 | any | PR with a receipt present (dogfood) | comment's receipt block uses the same markdown renderer as `prism receipts show 1 --as markdown` (byte-equal) | diff |
| GA-7 | fork PR | no write token | comment skipped with a notice; SARIF artifact still written | log |

---
## 7. Edge and chaos cases (run in the harness)
| ID | Case | Expected behaviour | Pass |
|---|---|---|---|
| CH-1 | Cold start: first ever prompt | daemon starts; prompt waits ≤ 3 s; no "warming" text | HK-6 |
| CH-2 | Index not ready (mono, 30 s) | silent hooks; tools return `PRISM_NOT_READY` with progress %, at most once | [O] |
| CH-3 | Missing node_modules | receipt `not_proven(no_node_modules)` | RE-2 |
| CH-4 | Offline (no network) | install from cache works; startup has no registry call blocking; all features work | [E] no `net.*` |
| CH-5 | Corporate proxy with TLS interception | `NODE_USE_SYSTEM_CA` path works for `upgrade`; core never needs the network | install test |
| CH-6 | Branch switch mid-session (`git checkout other`) | batch reindex ≤ 15 s; hooks silent while `stale`; Prepare after reindex reflects the new branch | [E] `index.branch_switch` |
| CH-7 | Huge diff (1,200 files) | review truncates ≤ 5 s; receipt ≤ 10 s | RC-3, RE-8 |
| CH-8 | Unsupported language (Rust/Python/Go repo) | LANG-1…4 behaviour | §5.12 |
| CH-9 | Two concurrent sessions, same repo, different tasks | separate baselines, packs, receipts and Envelope rows | GS-1 ×2, HK-11 |
| CH-10 | Two editors, different builds | newer client stops the old daemon via `/v1/stop` and starts its own; ≤ 1 restart per build change; `doctor` shows one build | [E] ≤ 1 `daemon.restart` |
| CH-11 | Daemon `kill -9` mid-index | next client restarts it; stale lock or reused pid detected | [E] |
| CH-12 | Stale `daemon.json` with a reused pid | hook verifies by HTTP `/v1/health` with token, not `kill(pid,0)` (R-B2) | [E] |
| CH-13 | Corrupt snapshot or SQLite | quarantined + rebuilt; hooks silent meanwhile | [E] `index.corrupt` |
| CH-14 | Disk full in `~/.prism` | degraded events; tools answer from memory or fail with a code; no crash loop | [E] |
| CH-15 | inotify limit 512 (Linux) | `watch.fallback` → polling; freshness ≤ 5 s | [E] |
| CH-16 | Version skew: hooks and server from different local builds | hooks silent; `doctor` fails "version mismatch"; `prism install --local` fixes it (COV-71) | [E] `version.skew` |
| CH-17 | Windows: paths with spaces and backslashes, CRLF | all S-INS and HK scenarios pass on windows-latest | CI required |
| CH-18 | Non-English prompt | no pack + English-only note | HK-4 |
| CH-19 | Question-only prompt | HK-2 | |
| CH-20 | Hooks disabled (`PRISM_HOOKS=0` or removed) | MCP still works; rules tell the agent to call `prepare_change` and `receipt` | [T] |
| CH-21 | No git (tarball checkout) | index works; churn and baseline `unavailable`; receipt uses mtime since session start | [O] |
| CH-22 | Detached HEAD, or in the middle of a rebase | no reindex storm; receipt notes the rebase | [E] |
| CH-23 | Repo path with unicode or spaces | all keys stable | test |
| CH-24 | Test runner hangs | RE-4 | |
| CH-25 | Agent writes 500 files in 10 s (codegen) | watcher batches; no CPU pin > 30 s | [E] |

---
## 8. Observability
- **`events.jsonl`** (§2.5). `prism stats [--since 1d]` reports p50/p95 per hook and tool, outcome counts, and top reasons. These are the T2–T5 and T10 numbers.
- **`prism doctor [--json] [--fix]`** reports:
  - Node, the native module, and the bin path that resolved.
  - Each editor's config found, and the Prism version it pins.
  - Hooks installed per editor, and the hook ↔ server version.
  - Daemon pid, build, port, uptime, workspaces, and watcher mode.
  - Per workspace: `headSha` vs snapshot, `stale`, `parsedPct`, `unresolvedImports`.
  - The last 10 hook runs and the last receipt.
  - Lens store (shadowing), custom skills check (§5.4), consent state.

  `--fix`: restart the daemon, reindex, rewrite configs to the local build.
- **The receipt and Envelope are queryable from the CLI:** `prism receipts`, `prism envelope`.

---
## 9. Verification and release gate

### 9.1 Contract tests (unit/integration, in `verify:milestone`)
- `skills-tools.contract`: every tool named by a skill, command, prompt, rule or server instruction is in the default set (or `receipt` for hookless).
- `prepare.budget.property` (PC-9), `resolver.golden` (§4.1), `blast.symbol.golden`, `lens.route` (LN-1…5, 11), `lens.checks`, `classifier.corpus` (§5.11).
- `hook.pack-isolation`: run `dist/pack/hooks/prism-hook.mjs` from a temp directory with no monorepo siblings → the bin resolves via `install.json`. This catches R-A1.
- `no-silent-catch` lint. `no-network` trap (already exists).

### 9.2 Clean-machine install matrix (release + nightly)
OS {ubuntu-latest, macos-latest, windows-latest (required)} × Node {24 LTS, latest current} × client {CC headless, `cursor-agent`, Codex CLI, opencode} × network {online, offline-after-install, proxy}. Each cell installs from **locally packed tarballs** of `/Users/shaileshjha/Prism` (§3.0), never from the registry.

| ID | Check |
|---|---|
| S-INS-1 | `prism install <client>` exits 0; `doctor --json` has no errors |
| S-INS-2 | The client lists exactly the 9 default tools (+ `receipt` for CU and CX), and the CU/CX rule line is present |
| S-INS-3 | Scripted prompt "fix the due date on the tenant dashboard" on rentmaadi → pack injected (or `prepare_change` called on hookless clients) → edit → receipt file written |
| S-INS-4 | `prism uninstall --purge` → zero Prism files outside the repo; daemon gone |
| S-INS-5 | Reinstall a newer local build with a running session: the old daemon is stopped, the new one started, no duplicate daemons, hooks work after the next prompt |

### 9.3 Golden benchmark
- **Repos** at pinned shas: hono, preact, es-toolkit, rentmaadi (**local-only**, `~/Desktop/rentmaadi`, decision 22), portpilot (`bf153b8`; public, so CI clones it, and local runs use `~/Desktop/port-pilot` at that SHA in a clean worktree), and the Prism repo (mono) at `GOLDEN_MONO_SHA`. Unsupported-language fixtures are only for LANG rows.
- **Tasks:** 40 per TS/JS repo (4 × 40) + 30 for mono + 30 for portpilot = **220**. **20% held out** (44 tasks, 6 of them portpilot; sealed, rotated each release, never used for tuning).
- **Labels:** the file a developer opened first, the expected tests, the expected blast set.
- **Metrics:** Prepare top-1/top-3 hit rate, test-impact precision/recall, blast precision/recall, hook p50/p95, receipt p50/p95, cold-index time, tokens per Prepare.
- **Gate:** T4–T9 met. No metric regresses by more than 2 points vs the last release.
- **Calibration study for `saved`:** paired runs with Prism on and off over 30 tasks per client, measuring tokens, turns, and broken builds. That produces `calibrated-v1` with a CI. Until then, "not calibrated".

### 9.4 End-to-end agent transcript harness
- `scripts/e2e-agent/`: drives CC (`claude -p --output-format stream-json`), `cursor-agent`, `codex exec` and `opencode run` in sandboxes of the golden repos. The prompts are the real ones in §5.
- It captures every tool call and argument, the hook injections, the edits and the receipts. **Assertions:**
  - The expected first Prism call ([T]).
  - The injected pack contains the expected file.
  - No removed or unknown tool is called.
  - The final build/test passes where the scenario edits code (RN-1, SK-2).
  - The receipt verdict is truthful vs an independent test run.
- Models are non-deterministic: each scenario runs 3×, and passes at ≥ 2/3 for behaviour assertions. Prism-side outputs ([O]) must pass 3/3.
- Cost control: a nightly subset, and the full suite before release.

### 9.6 Benchmark uplift plan
**Phase 0, baseline capture (before any change):** on the checkpoint commit (§0.5 Step 0), run B1–B6 and the golden benchmark. Commit the results to `plans/notes/benchmark/baseline-2.0/` with machine info. Nothing in Phases 1–8 merges until this exists. Benchmarks that don't exist yet (B2 eval, B4 golden, B7 classifier, B8 hooks) are built in Phase 0 against the current code, so their baseline is the current code too.

| ID | Benchmark (script) | Metric | Current baseline (source) | 2.0 target | Driven by | How measured |
|---|---|---|---|---|---|---|
| B1 | Orientation, `scripts/bench/agent-orientation.ts` (5 fixtures × 6 questions) | tokens returned with Prism vs without | **with 44,149 vs without 9,945 est. tokens; 70 vs 325 calls; 7,586 vs 43 ms** (`plans/notes/benchmarks-latest.json`, 2026-09-04). Prism currently returns **4.4× more** tokens | with-Prism tokens ≤ without-Prism tokens; calls ≤ 70; health question removed (5 questions) | §0.3 tool cut, Prepare budget §5.1, `repository_overview` merge, bounded `graph` | rerun the script; report per question |
| B2 | Prepare replay eval, `scripts/bench/prepare-eval.ts` (**new**, M-093: about 200 commits from Prism, es-toolkit, hono, zod + rentmaadi) | recall@pack, top-1, top-3, tokens p50/p95 | capture in Phase 0 (E0) | top-3 ≥ 85% (T7); recall@pack ≥ E0 + 10 pts; tokens p95 ≤ 2,000 | resolver §4.1, IDF ranking + seeds + budget §5.1, symbol blast §4.2 | held-out 20% reported separately |
| B3 | Replay (regression catch), `scripts/replay-benchmark.ts` | catch rate, false-alarm rate, median receipt time | **catch 5/7 = 71%; false alarms 1/6 = 17%; median receipt 3.4 s** (`plans/notes/benchmark/R0.md`, 2026-10-06; R1 unchanged) | catch ≥ 6/7 (or ≥ 80% on an enlarged set of ≥ 20 regressions); false alarms ≤ 5%; structural receipt median ≤ 1.5 s, p95 ≤ 3 s (T4) | baseline-aware verdict (M-092), symbol-level test impact §4.3, daemon receipt §5.7, value-only cycles | enlarge to ≥ 20 regressions + ≥ 20 controls in Phase 0, then rerun |
| B4 | Golden benchmark (§9.3, **new**) | top-3, test-impact P/R, blast P/R | capture in Phase 0 | T7–T9 | §4, §5.1 | 220 tasks (incl. 30 portpilot), 44 held out; rentmaadi rows local-only |
| B5 | Daemon freshness, `scripts/bench/daemon-freshness.mjs` | edit→index p95; symbol answer after edit p95; auto-Prepare p95; first Prepare warm | **268 ms; 2.3 s; 1.7 s; 786 ms p50 at 10k** / 53 ms auto-Prepare at 1k (`PROGRESS.md:106`, `M-095:35`) | ≤ 300 ms; ≤ 1.0 s; ≤ 1.0 s at 10k, ≤ 300 ms at 1k; ≤ 500 ms | watcher ignores + batching §2.4, daemon owns Prepare §2.1, budget cap | 1k and 10k generated fixtures (`generate-fixture.mjs`) |
| B6 | Real-agent A/B, `scripts/bench/agent-ab.ts` (Claude Code + opencode; Codex CLI if detected) | success, tokens, seconds, USD (B − A, 95% CI) | **success 97% → 100% (+3.0 pp, CI 0–9.1); tokens +28,571 (CI −1,983…57,273), Prism arm uses MORE; seconds −50 (CI −162…13); USD +0.03** (`benchmark-real-agents.md`, 33 runs/arm, 2026-10-11) | tokens B − A ≤ 0 with the CI upper bound < +5%; seconds B − A < 0 with CI excluding 0; success not lower | hook injection replacing tool calls §5.8, Prepare budget, tool cut (smaller tool list in context), receipt dedupe | rerun 11 tasks + 10 new, 3 runs each, per client, with Prism wired to the **local build** (absolute bin paths, §3.0; DEV-3). Clients: CC and OC always. CX only if `codex` is on PATH and `codex login status` succeeds; otherwise it's skipped and `ab.skip codex not configured` is logged in the report. No cost cap. If a provider returns a quota or credit error, the run stops, completed runs are kept, and the report says "stopped: quota/credits exhausted at run N" for the user |
| B7 | Prompt classifier corpus (§5.11, **new**; owner prompts stored outside the repo, decision 23; CI uses a synthetic public subset) | change recall, question false-positive rate | capture in Phase 0 (current `CHANGE_VERB` regex, `prism-hook.mjs:368`) | recall ≥ 0.95, FP ≤ 0.05 | §5.11 classifier | 400 English + 40 non-English |
| B8 | Hook latency (**new**, from `events.jsonl` in harness runs) | prompt/edit/stop p95 | capture in Phase 0 (current hook timings via a wrapper) | T2–T4 | §2.1, §2.2, §5.8 | harness runs, all 4 clients |
| B9 | Performance budgets, `scripts/bench/run.mjs` + `budgets.json` (`bench.yml`) | ms per operation at small/medium | ceilings in `budgets.json` (e.g. small: index_cold 3,500, blast_radius 150) | no budget raised; new ops added (C-14) | everything | existing `bench:check` |
| B10 | Install matrix (§9.2) | cell pass rate | capture in Phase 0 (expected to fail: A1) | T1 | §2.2, §3 | CI |

### 9.7 Regression gate on every PR (CI)
A required `prism-gate` workflow on every PR to the 2.0 branch and `main`:
0. **Private repo rule:** CI jobs never clone `rentmaadi`. Rows that use it are tagged `local-only` and run by `bun run bench:local` on the owner's machine (nightly local runner). A PR touching ranking or blast must attach the local run's JSON, or the gate stays pending.
1. Fast gates (every PR, ≤ 15 min): unit + contract tests (including `coverage-matrix.contract`, Appendix A.4); B7 classifier; B9 budgets (small); B2 on a 40-commit fixed subset; B3 on the fast subset; B4 non-held-out TS subset (hono, es-toolkit). Compared to the **last green main** numbers stored in `plans/notes/benchmark/main-latest.json`.
2. **Fail the PR if:** top-3 or recall@pack drops > 1 pt; test-impact precision or recall drops > 2 pts; catch rate drops at all or false-alarm rate rises; any p95 latency (B5, B8) rises > 15%; any `budgets.json` ceiling is exceeded; B1 tokens rise > 5%.
3. **Cross-guard:** every PR runs both the accuracy gates and the latency gates, whichever area it touches. A reliability fix can't lower accuracy, and an accuracy fix can't raise latency or break the hooks (contract tests run on every PR).
4. Nightly: full B2, B3, B4 (including held-out, results visible only to the gate), B5 at 10k, harness subset. Weekly or before release: B6 and the install matrix.
5. Raising a ceiling or lowering a threshold requires a note in `plans/architecture/08_PERFORMANCE.md` and owner approval (existing rule in `budgets.json`).

### 9.8 Testability fixes to the acceptance criteria
- T1 "install success ≥ 98%": measured over ≥ 50 runs per cell per release (nightly repeats), not a single run.
- "≥ 2/3 runs" for agent-behaviour rows is the pass rule for [T] checks; Prism-side [O] checks must pass 3/3.
- Lens checks are all deterministic (heuristic checks were cut, B.5).
- The classifier corpus's "anonymised real transcripts" come from the owner's own sessions only, with an explicit opt-in and stored in `plans/notes/benchmark/classifier/` with prompts only.
- CH-25 "no CPU pin": measured as daemon CPU > 90% for > 30 s from `process.cpuUsage` samples logged as events.

### 9.5 Release gate (all required)
1. `verify:milestone` green on ubuntu, macos and **windows**.
2. Contract tests §9.1 green.
3. Install matrix §9.2 green (≥ T1).
4. Golden benchmark §9.3 within gates, held-out included.
5. Transcript harness §9.4: all S-INS, HK, RE, RX, SK, LN, CL scenarios pass.
6. Chaos suite §7 green.
7. Publish readiness, **dry run only**: every package at `2.0.0` (lockstep), `npm publish --dry-run` and `check-publish-exports` pass on the local tarballs, `check-mcp-start` from tarballs, `no-published-refs` green.
8. Docs check: Node 24, 9 tools, TS/JS-only, no page or reference mentioning a deleted item (§0.4), install per editor, uninstall, troubleshooting entries for every `PRISM_* error code` code.
9. GA-1…8 pass using `uses: ./action` and the local CLI.
10. B6 real-agent A/B complete on CC and OC (and CX if configured), or stopped on quota/credits with that reported to the owner. A stopped run blocks release until the owner decides.

11. Appendix D.4 items 1–4 green (property/fuzz, mutation ≥ 75%/85%, coverage ≥ 85/80, 24 h soak).
12. Bug bash (Appendix C on macOS + Windows + Linux): 0 open P0/P1.
13. `plan-refs.contract`: every path, function and row ID cited in this plan exists.
14. Owner sign-off.
15. The final change report (decision 24) is complete and reviewed by the owner.
---
## 10. Implementation order (by dependency)
**Phase 0, checkpoint and baseline.** §0.5 Step 0 commit (with owner approval); build the missing benchmarks (B2 `prepare-eval.ts`, B4 golden, B7 classifier, B8 hook timing); capture B1–B10 into `baseline-2.0/`; set up the §9.7 gate with those numbers. C-1, C-6 (E0), C-14.

**Phase 1, foundations.** Nothing else can be measured or trusted without these:
- Event log and `no-silent-catch`.
- `resolvePrismBin` + `install.json`.
- Index identity (`schemaVersion`, `headSha`, `generation`).
- Daemon health endpoint with token (replaces the pid check).
- Everything in the §0.4 delete list. Then re-pin `GOLDEN_MONO_SHA` to the post-deletion commit.
- Contract test `skills-tools`.

**Phase 2, the engine is right.** Everything downstream reads these facts:
- Resolver + value-only cycles (§4.1).
- Symbol-level blast and test impact (§4.2–4.3).
- Orphans and entry points (§4.4).
- `graph find` dedupe (§4.5).
- TS/JS-only gate and the unsupported-language error (§4.6).

**Phase 3, Prepare.** IDF ranking, seeds, tests separated, hard budget with reserves, work order merged (§5.1, §5.5).

**Phase 4, the daemon owns the daily path.**
- MCP server ensures the daemon. Readiness endpoint.
- Session baseline in the daemon.
- Daemon-served receipt with async checks, dedupe and verdicts (§5.7).
- Watcher ignores, polling fallback, branch-switch batching, corrupt-file quarantine (§2.4).
- On build skew, the newer client stops the old daemon and starts its own.

**Phase 5, hooks and lenses.**
- Classifier (§5.11).
- H-SESSION, H-PROMPT, H-PRE-EDIT, H-POST-EDIT, H-STOP contracts (§5.8). Session-keyed packs. Deny/warn policy.
- Lens routing fixes, custom-lens triggers and conflict rules, data-backed checks, evidence follows the task, overrule fingerprints, upgrade safety (§5.3).

**Phase 6, the tool surface.**
- Consolidation into the 9 defaults. Old names deleted outright.
- `review_changes` gets `prDescription` and `lensFindings`. New `receipt` tool.
- Skills rewritten (§5.4). Custom-skill check.
- CLI commands aligned (§5.9).
- Envelope ledger and calibration hook (§5.6).

**Phase 7, every editor.**
- `prism install/upgrade/uninstall`.
- The Cursor/Codex rule line + `receipt` (official path), Cursor hooks where available, the opencode plugin shim.
- Pinning and offline auto-update.
- Claude marketplace publish. Atomic pack build.

**Phase 8, CI and release readiness** (no publish, no tags, no push).
- Action fixes (§6).
- Lockstep versions and the publish check.
- Install matrix, golden benchmark, transcript harness, chaos suite.
- `doctor --fix`, `prism stats`.
- Docs.

**Release 2.0.0 (single final step, only after every item of §9.5 passes and the owner explicitly confirms each push, tag and publish; decision 25):** push the branch, merge, tag `v2.0.0`; `npm publish` all packages at 2.0.0 in the order of `publish-npm.mjs`; move the Action `v2` tag; publish the Claude plugin to the marketplace; re-enable the publish workflows. Then run S-INS-1…5 once against the **published** packages as a post-release smoke test, and remove dev-mode `no-published-refs`. Nothing in this step happens earlier.

Phases 2–3 and 4 can be built in parallel once Phase 1 lands. Phase 5 needs Phases 3 and 4. Close-out items are folded in: C-2/C-3/C-12 in Phase 1, C-6 in Phase 3, C-5/C-8 in Phase 4, C-4/C-7/C-9 in Phase 6, C-2 (editors) in Phase 7, C-10/C-11/C-13 in Phase 8. Every phase merges only through the §9.7 gate.

---
## 11. Definition of done
- [ ] Installing over 1.x passes WIPE-1…8.
- [ ] Every item in §0.4 deleted from code, docs, tests, configs and CI. `rg` for each deleted name finds no hits outside the CHANGELOG.
- [ ] Default MCP list = exactly 9 tools. `skills-tools.contract` green. Deleted names don't exist (standard unknown-tool error).
- [ ] TS/JS only: unsupported languages return the 2.0 message (LANG-1…4). Non-English prompts get no pack + the note.
- [ ] Custom lenses only in `~/.prism/lenses`. Triggers and conflict rules pass CL-6…14.
- [ ] `needsSignOff` never blocks. Cursor/Codex rule path passes RX-1…6.
- [ ] Hooks resolve the server bin in an installed pack, with no npx anywhere in a hook path.
- [ ] Receipt served by the daemon. p95 ≤ 3 s warm. Verdict ∈ {proven, not_proven(reason), failed}. Deduped.
- [ ] No "warming" or raw stderr ever reaches the agent.
- [ ] All P§0 rows pass on fresh clones, except the deleted hono "health" row and with the preact row's `demo/` exclusion kept, plus §5 scenarios PC, BR, TI, RC, SD, RN, GS, RO, GR, LN, CL, SK, EN, RE, RX, HK, CLI, GA, LANG.
- [ ] Chaos CH-1…25 pass.
- [ ] Install matrix green on 3 OSes × 4 clients × online/offline/proxy, from packed tarballs.
- [ ] Golden benchmark incl. held-out meets T7–T9. Hook and receipt p95 meet T2–T4.
- [ ] Classifier corpus gate met.
- [ ] `prism doctor` explains every failure code. `events.jsonl` has zero silent outcomes in the harness runs.
- [ ] All development, tests, matrix and A/B used the local build (`no-published-refs` green). Release 2.0.0 done as the single final step: lockstep publish at 2.0.0. No package skipped while changed. Action `vN` tagged. Uninstall leaves nothing behind.
- [ ] Owner smoke test (Appendix C) passes with nothing abnormal; B.4 checks green; B.5 cuts applied.
- [ ] Coverage matrix (Appendix A) complete; `coverage-matrix.contract` green; all COV rows pass.
- [ ] Docs: Node 24 LTS, Action `@v2`, 9 tools, install, upgrade and uninstall per editor, troubleshooting per error code.

---
## 12. Decisions (answered by the owner)
1. **Node:** minimum 24 LTS. Node 22 is dropped from every matrix and from the Action default.
2. **Version:** ship as 2.0. The GitHub Action is tagged `v2`; there is no v1.
3. **Monorepo golden repo:** this Prism repo at a pinned commit (`GOLDEN_MONO_SHA`).
4. **Lens storage:** custom lenses live only in `~/.prism/lenses`. There are no repo or team lenses.
5. **Custom lens choice:** by name or by trigger phrase. Named beats trigger, trigger beats built-in, the longest phrase wins, and ties go to the most recently edited lens, reported as a conflict.
6. **Prompt language:** English only. Non-English prompts get no pack and a one-line note.
7. **`needsSignOff`:** warns, never blocks (no setting to block). Only generated or vendored `offLimits` paths are denied.
8. **Cursor and Codex:** supported through the installed rule/AGENTS.md line that calls `prepare_change` before edits and `receipt` before finishing. This is the official path.
9. **Languages:** TypeScript and JavaScript only. Others return a clear "unsupported in 2.0" message.
10. **Old tool and CLI names:** deleted in 2.0. No aliases, no hints, no migration doc; the standard unknown-tool/command error applies.
11. **`agents_md`:** stays an opt-in MCP tool.

12. **Built-in lenses** (Architect, Dev, QA) keep fixed routing (`chooseLens` patterns). They have no editable triggers. Triggers are for custom lenses only.
13. **No backward compatibility after 2.0.** Everything old or unsupported is deleted (§0.4). No 1.x upgrade path, no migration code, no compatibility shims. `GOLDEN_MONO_SHA` is pinned to a commit after those deletions.

14. **Installing over 1.x data:** `prism install` wipes 1.x `~/.prism` automatically (derived data, no migration). It keeps only 2.0-valid custom lenses (with overrules) and 2.0-valid config keys, moves invalid lenses aside with a reason, and prints one summary line (§3.1a).

15. **Close-out and benchmarks:** M-087…M-100 open items are folded into the phases per §0.5. A Phase 0 baseline and the §9.7 PR gate come before any change.

16. **Graph artifacts:** `graph.html`, `GRAPH_REPORT.md` and `prism graph open` are deleted in 2.0. `graph.json` export stays.
17. **Real-agent A/B:** runs on Claude Code and opencode, plus Codex CLI only when it's configured (otherwise skipped with a logged note). No cost cap. If credits or quota run out, it stops and reports to the owner.

18. **Local build only until 2.0.0:** nothing is pushed, tagged or published before 2.0.0. Every install, test, matrix cell and A/B run uses the local build of `/Users/shaileshjha/Prism` (absolute paths, linked or locally packed tarballs). `prism doctor` and the `no-published-refs` contract fail on any reference to the published packages. Prism 2.0.0 is released once, at the end, after the full gate passes.

19. **Quality bar:** Appendix B rules and checks apply to every PR. The items in B.5 are cut as overengineering. Release needs the Appendix C owner smoke test with nothing abnormal.

20. **Readiness:** the three-pass review (Appendix D) is applied; residual risk is bounded by D.4 gates; the git-hook writer in `prism graph` is deleted.

21. **Checkpoint:** done as local commit `2480b92` on `milestone/M-087-focus-reset-plan` (not pushed). Phase 0 baselines run on this commit.
22. **rentmaadi is private:** its golden, benchmark, harness and smoke rows run **locally only**, against the owner's checkout. There's no deploy key and no CI access. CI runs every other golden repo. The release gate takes the rentmaadi results from a local run on the release-candidate commit, recorded in `plans/notes/benchmark/` (numbers only, no source).
23. **Classifier corpus:** may use the owner's own past prompts. They're collected locally, stored **outside the repo** (`~/.prism-dev/classifier-corpus/`, path set by `PRISM_DEV_CORPUS`), and never committed or published. Only aggregate metrics (recall, FP rate) are committed.
24. **Final change report:** a required deliverable when implementation ends: `plans/notes/prism-2.0-change-report.md`. Contents:
    - every change, grouped by phase and area, with files changed, the reason (plan item IDs) and the tests added (row IDs)
    - before/after numbers for B1–B10 against the Phase 0 baseline
    - every deletion (package, tool, command, flag, env var, file, doc) with line counts
    - known residual risks and limitations (from D.4)

    It's generated as far as possible from the git log (plan IDs in commit messages), the benchmark JSONs and `deleted-names.contract`. It's checked by `plan-refs.contract`, and it's release-gate item 15.
25. **Pushes and deployments need explicit owner confirmation:** no `git push`, tag, publish, deployment, Action tag or external upload happens without the owner's explicit confirmation for that specific action, including in the final Release 2.0.0 step (each sub-step is confirmed). Local commits follow AGENTS.md (owner approval).

26. **Golden repo paths:** rentmaadi is `~/Desktop/rentmaadi` (local-only). **PortPilot** (`~/Desktop/port-pilot`, `Shailesh200/PortPilot`, public TS/Electron) joins the golden set pinned at `bf153b8`, with 30 benchmark tasks (6 held out) and rows PP-1…6. As a public repo it may run in CI. Local runs use a clean worktree at the pinned SHA, because the local checkout has 2 uncommitted files and must never be modified by the harness.

27. **IDE extensions and app UI (Decision B, 2026-10-14):** `packages/vscode-extension`, `packages/cursor-extension`, `packages/app-shell` and `apps/playground` are deleted entirely in 2.0, with their build, CI, publish and docs references and workspace entries (§0.4 #29–#30). `apps/website` stays, stripped of deleted features. Appendix A.2 had no UI rows (UI was already out of scope), so no matrix row is removed; no SMK step depended on an IDE surface, so Appendix C is unchanged except that no step may open an IDE panel.
28. **Implementation calls made during Phase 1 (logged, consistent with this plan; owner may overrule):**
    - `host-session` and the whole consent subsystem are deleted: with pagespeed/GitHub integrations gone, no consent-gated method remains; the no-network suite is the contract.
    - Feature inference stays **internal** (feeds ranking in `prepare_change`/`blast_radius`); no tool, command or public SDK method exposes it. `agents_md` is generated without a features section.
    - The pack `mcp.json` launches `prism-mcp` (resolved per §2.2); `PRISM_DEV_NODE` selects the node binary for local builds.
    - Indexer starts at a fresh schema v1; an older cache is reset (derived data), never migrated.
    - `packages/ui` is slimmed to tokens + motion; `graph-engine` `layoutGraph` is deleted with the map.
    - `scripts/agent-native-proof.ts`, `scripts/spike-claude-bg.sh` and the verify `steps` option are deleted.
    - Website blog posts (`apps/website/content/posts`) are history, like `CHANGELOG.md`, and are excluded from `deleted-names`.
    - `PRISM_TOOL_COUNT` means the default (9) count; `PRISM_ALL_TOOL_COUNT` (20) includes opt-in tools.
    - The root `opencode.json` (#28) is gitignored owner-local config; it is not edited by the implementation (hard rule) and is replaced by `prism install opencode` output in SMK-2.
    - Docs may only name CLI commands that exist (`scripts/check-docs.mjs`); commands still to be built in later phases (`install`, `uninstall`, `upgrade`, `lens`, `stats`) are on an explicit planned list that must be empty at release.

### Open questions
None.

---
## Appendix A. Coverage matrix (every user-facing item in 2.0)
Built from the code (read-only), not the docs, on `milestone/M-087-focus-reset-plan`. Items on the §0.4 delete list and UI are excluded. **Covered** = an existing row checks it. **New** = covered by a COV row added below. Total: **142 items**. **71** were covered (or partly) before this audit; **71** were uncovered or partial and now have COV rows.

### A.1 Plan corrections found by the audit
- **`graph` modes in the code are `find`, `neighbors`, `path`, `explain`**, with `direction: in|out|both` and `maxHops` (`mcp-server/src/tools/graph.ts`). §0.3/§5.1 said `find|search|refs|neighbors|route`. **Fixed contract:** `graph` modes = `find`, `search` (from `search_symbols`), `refs` (from `find_references`), `neighbors`, `path` (was `dependency_route`; the name `route` is not used), `explain` (single file; folders stay in `explain_area`).
- **`agents_md` modes are `generate|check`** (`tools/agents-md.ts`), not `verify`. OPT-3 now uses `check`.
- **`blast_radius` has `intent: edit|delete` and `kind: file|symbol`** (`tools/impact.ts`). These are now in the contract.
- **`guard_session` takes `preExistingChanges` and `tests`**; **`review_changes` takes `base`, `paths`, `intent`**; **`rename_impact` takes `name`, `newName`**. These are now in the contracts.
- **Error codes:** the code uses `PrismErrorCode` → `PRISM_ANALYZER_FAILED, PRISM_CANCELLED, PRISM_GRAPH_ERROR, PRISM_INDEX_FAILED, PRISM_INDEX_REQUIRED, PRISM_INVALID_ID, PRISM_INVALID_PATH, PRISM_IO_ERROR, PRISM_NOT_FOUND, PRISM_UNKNOWN, PRISM_UNSUPPORTED, PRISM_VALIDATION, PRISM_WORKSPACE_NOT_OPEN` (`shared/src`). The plan's `PRISM_E_*` names are **replaced** to fit that scheme: `PRISM_E_NOT_READY` → new `PRISM_NOT_READY`; `PRISM_E_TIMEOUT` → new `PRISM_TIMEOUT`; `PRISM_E_NO_GIT` → new `PRISM_NO_GIT`; `PRISM_E_PATH_REFUSED` → existing `PRISM_INVALID_PATH`; `PRISM_E_UNSUPPORTED_LANGUAGE` → existing `PRISM_UNSUPPORTED` with `detail.reason:"language"`. Total: 16 codes, each with a troubleshooting entry.
- **More items for the §0.4 delete list** (dispatch, hub, UI or report-only):
  - env vars: `PRISM_WORKER`, `PRISM_DISPATCH_ROLE`, `PRISM_JOBS`, `PRISM_JOBS_LOCAL`, `PRISM_JOB_ID`, `PRISM_LAB_PORT`, `PRISM_CONSOLE_HOST`, `PRISM_CONSOLE_ALIAS`, `PRISM_PLAYGROUND*`, `PRISM_TOAST_EVENT`, `PRISM_LIVE_MODELS`, `PRISM_BUNDLE_STATS_PATH`
  - consent purposes: `network.pagespeed`, `network.github` (their features are deleted)
  - CLI: `--badge` (health badge), `--zoom` (map)
  - `budgets.json` ops: `repository_map`, `dna`, `health`
- **Consent purposes kept:** `network.git-remote` (for `review --base` fetch in CI) and `network.package-install` (only if a kept check runner uses it; otherwise delete). Contract test: every kept purpose has a kept feature that calls it.

### A.2 Matrix
| # | Area | Item (source) | Rows |
|---|---|---|---|
| 1 | Tool | `prepare_change` `task` (`tools/prepare.ts`) | PC-1…12 |
| 2 | Tool | `prepare_change` `budget` | PC-9, COV-1 |
| 3 | Tool | `blast_radius` `target` | BR-1…7 |
| 4 | Tool | `blast_radius` `intent: edit|delete` | COV-2 |
| 5 | Tool | `blast_radius` `kind: file|symbol` | BR-2, COV-3 |
| 6 | Tool | `blast_radius` `limit` | COV-4 |
| 7 | Tool | `test_impact` target/paths | TI-1…6 |
| 8 | Tool | `review_changes` `paths` / `base` | RC-1…6 |
| 9 | Tool | `review_changes` `intent` | COV-5 |
| 10 | Tool | `review_changes` `lens`, `format:prDescription` | RC-2, RC-5, LN-* |
| 11 | Tool | `review_changes` truncation | RC-3 |
| 12 | Tool | `safe_delete` | SD-1…4 |
| 13 | Tool | `rename_impact` `name`, `newName` | RN-1…3 |
| 14 | Tool | `guard_session` | GS-1…3 |
| 15 | Tool | `guard_session` `preExistingChanges` | COV-6 |
| 16 | Tool | `guard_session` `tests` | COV-7 |
| 17 | Tool | `repository_overview` | RO-1…3 |
| 18 | Tool | `graph` `find` | GR-2 |
| 19 | Tool | `graph` `search` | GR-4 |
| 20 | Tool | `graph` `refs` | GR-3 |
| 21 | Tool | `graph` `neighbors` + `direction in/out/both` | COV-8 |
| 22 | Tool | `graph` `path` + alternatives | GR-1, COV-9 |
| 23 | Tool | `graph` `explain` | COV-10 |
| 24 | Tool | `graph` `maxHops` | COV-9 |
| 25 | Tool | opt-in `dependency_graph` (`packageAggregation`, `limit`) | COV-11 |
| 26 | Tool | opt-in `knowledge_graph` (`path`/`limit` required) | EN-7, COV-12 |
| 27 | Tool | opt-in `dependency_cycles` (value-only) | OPT-1 |
| 28 | Tool | opt-in `list_packages` | COV-13 |
| 29 | Tool | opt-in `explain_area` | OPT-4 |
| 30 | Tool | opt-in `explore_code` (bounded usages) | COV-14 |
| 31 | Tool | opt-in `list_findings` (unused, duplicate, wrapper) | OPT-2, COV-15 |
| 32 | Tool | opt-in `agents_md` `generate` | COV-16 |
| 33 | Tool | opt-in `agents_md` `check` | OPT-3 |
| 34 | Tool | opt-in `workspace_status` | COV-17 |
| 35 | Tool | opt-in `capabilities` | COV-17 |
| 36 | Tool | opt-in `review_with` brief/record | COV-18 |
| 37 | Tool | `receipt` | RX-1…6 |
| 38 | Tool | `extraTools[]` enabling opt-in tools | COV-19 |
| 39 | Tool | unknown/deleted tool name | GR-5 |
| 40 | Tool | `instructions` ≤ 1.5 KB | C-4 test |
| 41 | Prompt | `orient` | MP-1 |
| 42 | Prompt | `before_edit` | MP-2 |
| 43 | Prompt | `review_diff` | MP-3 |
| 44 | Resource | overview, last receipt (`resources.ts`) | COV-20 |
| 45 | Hook | session: orientation / silent | HK-13, COV-21 |
| 46 | Hook | session: baseline recorded | GS-1 |
| 47 | Hook | session: daemon start/register | HK-6 |
| 48 | Hook | prompt: change → pack | HK-1, HK-3 |
| 49 | Hook | prompt: question → none | HK-2 |
| 50 | Hook | prompt: non-English → note | HK-4 |
| 51 | Hook | prompt: vague → none | HK-5 |
| 52 | Hook | prompt: wait/retry | HK-6, HK-7 |
| 53 | Hook | prompt: unsupported language note | LANG-1 |
| 54 | Hook | before-edit: offLimits deny | HK-8 |
| 55 | Hook | before-edit: needsSignOff warn | HK-9 |
| 56 | Hook | before-edit: outside pack | HK-11 |
| 57 | Hook | before-edit: not ready silent | HK-10 |
| 58 | Hook | before-edit: path outside repo / no path (`relPath` null) | COV-22 |
| 59 | Hook | after-edit: high-blast line + reindex | HK-12 |
| 60 | Hook | stop: receipt, dedupe, `stop_hook_active` | RE-1…10 |
| 61 | Hook | unknown event | COV-23 |
| 62 | Hook | workspace candidate choice (`rootCandidates`) | COV-24 |
| 63 | Hook | Cursor hooks / opencode plugin events | HK-1 (all 4), RE-7 |
| 64 | Skill | `prism-onboard` | SK-1 |
| 65 | Skill | `prism-safe-change` | SK-2, SK-3 |
| 66 | Skill | `prism-review-pr` | SK-4, SK-5 |
| 67 | Skill | `prism-lens` | SK-6 |
| 68 | Skill | user custom skills | SK-7, SK-8 |
| 69 | Command | `/prism-review` | COV-25 |
| 70 | Command | `/prism-check` | COV-25 |
| 71 | Command | `/prism-graph` | COV-25 |
| 72 | Lens | Architect/Dev/QA routing | LN-1…5, LN-11 |
| 73 | Lens | each data-backed check id (13) | LN-6…9, COV-26 |
| 74 | Lens | each evidence type (`LENS_EVIDENCE`: boundaries, cycles, rationale, off-limits, blast, test-impact, verify-plan, test-layout, reuse, house-style, duplicates) | COV-27 |
| 75 | Lens | custom add/edit/remove/seed/show/list (`prism lens`) | CL-1, CL-4, CL-5, COV-28 |
| 76 | Lens | triggers + conflicts | CL-6…13 |
| 77 | Lens | overrule + fingerprint | CL-2, CL-3 |
| 78 | Lens | storage only in `~/.prism/lenses` | CL-14 |
| 79 | Lens | upgrade keeps renamed built-in | LN-10, WIPE-2 |
| 80 | Prepare | files / tests / reuse / houseStyle / notes / order / lens / stale / coverage | PC-*, MEM-1, PC-10, PC-11 |
| 81 | Prepare | `tokenEstimate ≤ budget` | PC-9 |
| 82 | Prepare | `prism prepare` CLI | COV-29 |
| 83 | Envelope | calls, chatCalls, byTool, buckets, budget | EN-1…7 |
| 84 | Envelope | bytesKeptRatio / bytesKeptDeltaPp | COV-30 |
| 85 | Envelope | followThrough | EN-3, COV-31 |
| 86 | Envelope | clientNames / clientVersions | EN-3 |
| 87 | Envelope | saved / calibration | EN-4, AB-1 |
| 88 | Receipt | proven / not_proven(reasons) / failed | RE-1…6 |
| 89 | Receipt | `prism receipts` list/show `--as markdown` | CLI-3, GA-8, COV-32 |
| 90 | Daemon | `/v1/call`, `/v1/reindex`, `/v1/status`, `/v1/stop`, `/v1/workspaces` (+ new `/v1/receipt`, `/v1/health`) | COV-33 |
| 91 | Daemon | token auth, build check | CH-10, COV-34 |
| 92 | Daemon | lock + reused pid | CH-11, CH-12 |
| 93 | Daemon | idle shutdown (`idleMinutes`) | COV-35 |
| 94 | Daemon | `batteryPausePercent` | COV-36 |
| 95 | Daemon | `debounceMs` | COV-37 |
| 96 | Daemon | `maxMemoryMb`, `maxWorkspaces` | COV-38 |
| 97 | Daemon | `nice` | COV-39 |
| 98 | Daemon | watcher + fallback + branch switch | CH-6, CH-15, CH-25 |
| 99 | Config | `~/.prism/config.json`: `extraTools[]`, daemon keys | COV-19, COV-35…39 |
| 100 | Config | repo `.prism/config.json` (`PRISM_CONFIG_RELATIVE_PATH`) | COV-40 |
| 101 | Ignore | `.prismignore` | COV-41 |
| 102 | Ignore | `.gitignore` patterns (`PRISM_GITIGNORE_PATTERNS`) + watcher ignores | COV-41 |
| 103 | Ignore | `--exclude <glob>` | COV-42 |
| 104 | Ignore | `--max-file-bytes <n>` | COV-43 |
| 105 | Env | `PRISM_HOME` | WIPE-*, COV-44 |
| 106 | Env | `PRISM_WORKSPACE` | COV-45 |
| 107 | Env | `PRISM_DAEMON=0/1` | COV-46 |
| 108 | Env | `PRISM_MCP_BIN` | HK-14 |
| 109 | Env | `PRISM_HOOKS=0` | HK-13 |
| 110 | Env | `PRISM_AUTOPREPARE` (auto/off/0) | COV-47 |
| 111 | Env | `PRISM_AUTOPREPARE_MS` | COV-48 |
| 112 | Env | `PRISM_SKIP_SELF_UPDATE` | COV-49 |
| 113 | Env | `PRISM_MCP_PRETTY` | COV-50 |
| 116 | CLI | global `--json`, `--no-color`, `-q/--quiet`, `--verbose`, `-w/--workspace`, `-y/--yes`, `--help`, `--version` | COV-52 |
| 117 | CLI | exit codes 0/1/2/3 | GA-5, CLI-4, COV-53 |
| 118 | CLI | `doctor` (+ `--json --fix`, dev `no-published-refs`) | DOC-1…3, DEV-1 |
| 119 | CLI | `index` (`--all`, `--ci`) | COV-54 |
| 120 | CLI | `overview`, `explain`, `explore` | RO-*, COV-14 |
| 121 | CLI | `packages` | COV-13 |
| 122 | CLI | `blast --fail-on <band>` | CLI-2, COV-55 |
| 123 | CLI | `review --base --fail-on --format sarif|json|markdown` | CLI-1, GA-1 |
| 124 | CLI | `safe-delete`, `rename`, `test-impact` | SD, RN, TI (CLI variants COV-56) |
| 125 | CLI | `deps --packages`, `cycles --fail-on <count>` | COV-57 |
| 126 | CLI | `symbol --kind --in`, `refs --symbol`, `route --alternatives` | COV-58 |
| 127 | CLI | `graph export --out` (`--artifact`) | GX-1, GX-2 |
| 128 | CLI | `receipts` / `envelope` (`--days`) | CLI-3, EN-6, COV-59 |
| 129 | CLI | `remember`, `memories`, `forget` | MEM-1…3, COV-60 |
| 130 | CLI | `findings` | COV-15 |
| 131 | CLI | `agents-md` | COV-16 |
| 132 | CLI | `data prune` (dry run, `--yes`, `--delete`) | PRUNE-1…3 |
| 133 | CLI | `completions` (bash/zsh/fish) | COV-61 |
| 134 | CLI | `install/upgrade/uninstall` (`--local`, `--purge`) | S-INS-*, WIPE-*, DEV-* |
| 135 | CLI | `lens …` | CL-*, COV-28 |
| 136 | CLI | no-args first run (`--no-open` keeps working, prints the line) | CLI-5, COV-62 |
| 137 | Action | inputs `fail-on`, `base`, `version`, `prism-command`, `comment`, `upload-sarif`, `working-directory`, `node-version` | GA-1…8, COV-63 |
| 138 | Action | outputs `review-path`, `sarif-path`, exit code | COV-64 |
| 139 | Budgets | `budgets.json` ops index_cold/warm/incremental, dependency_graph, cycles, blast_radius + new ops; `peakRssBytes` | B9, COV-65 |
| 140 | Errors | 16 codes (A.1) | COV-66 |
| 141 | Consent | `network.git-remote`, `network.package-install` | COV-67 |
| 142 | Events | `events.jsonl` schema + rotation | T10, COV-68 |

### A.3 New coverage rows
| ID | Prompt / command | Expected | Verify / pass |
|---|---|---|---|
| COV-1 | `prepare_change {task:"add maxAge to cors", budget:800}` (hono) | `tokenEstimate ≤ 800`; cors file still first; reserves scaled | [O] |
| COV-2 | "can I delete src/utils/url.ts?" → `blast_radius {target, intent:"delete"}` (hono) | risk reflects deletion (all dependents break), matches `safe_delete` blockers | [O] sets equal |
| COV-3 | `blast_radius {target:"debounce", kind:"symbol"}` vs `kind:"file"` on `debounce.ts` (es-toolkit) | symbol ⊆ file; symbol excludes unrelated exports' importers | [O] |
| COV-4 | `blast_radius {target:"src/index.ts", limit:5}` (preact) | ≤ 5 rows + `truncated.total` | [O] |
| COV-5 | `review_changes {intent:"delete"}` on a diff deleting a file | per-path verdicts use deletion semantics | [O] |
| COV-6 | `guard_session {preExistingChanges:["a.ts"]}` with a.ts and b.ts dirty | only b.ts ranked | [O] |
| COV-7 | `guard_session {tests:["x.test.ts"]}` | tests already run are marked, not listed as untested | [O] |
| COV-8 | "what does src/compose.ts import, and who imports it?" → `graph {mode:neighbors, direction:both}` (hono) | in and out lists correct vs the resolver | [O] |
| COV-9 | `graph {mode:path, from, to, maxHops:2}` with no 2-hop path | empty + "no path within 2 hops" | [O] |
| COV-10 | "explain src/middleware/cors/index.ts" → `graph {mode:explain}` | purpose from exports, in/out degree, its test | [O] |
| COV-11 | `extraTools:["dependency_graph"]`, "show the package dependency graph" (Prism mono) | package-aggregated graph, `unresolvedImports` count | [O] |
| COV-12 | `knowledge_graph` with neither path nor limit | `PRISM_VALIDATION` naming the missing input | [O] |
| COV-13 | "list the packages in this monorepo" (`list_packages`, `prism packages`) | Prism repo packages post-deletion, with roots | [O] |
| COV-14 | `prism explore getNextRentDueDate` / `explore_code` (rentmaadi) | usages ≤ 50 with envelope, similar code, timeline | [O] |
| COV-15 | "find unused exports" → `list_findings` / `prism findings` (es-toolkit) | unused exports correct; wrappers listed; re-exports not duplicates | [O] spot-checked set |
| COV-16 | `agents_md {mode:"generate"}` then `check` after adding a cycle | generate writes the file; check reports the drift | file + [O] |
| COV-17 | `workspace_status`, `capabilities` on a fresh index | readiness and freshness fields, `headSha` matches; deleted capabilities absent | [O] |
| COV-18 | `review_with {action:"brief"}` then `{action:"record", verdicts:[…]}` | brief includes procedure + evidence; record stores; unknown lens ids returned | [O] |
| COV-19 | add `"dependency_graph"` to `extraTools[]` in `~/.prism/config.json` | `tools/list` = 10 after client restart; an unknown name → `doctor` error | [O] |
| COV-20 | MCP client reads each resource URI | all resolve; none references deleted data | contract |
| COV-21 | session start with a fresh snapshot (CC, hono) | orientation ≤ 300 tokens injected | [O] |
| COV-22 | edit hook receives `tool_input.file_path` outside the repo (`/tmp/x.ts`) or none | `{}`, event `no path` | [O][E] |
| COV-23 | hook invoked with an unknown event name | `{}`, event `unknown event` | [O] |
| COV-24 | CC session in `apps/web` of a monorepo; Cursor multi-root workspace | workspace = git root; winning candidate logged | [E] |
| COV-25 | `/prism-review`, `/prism-check`, `/prism-graph` in CC and CU | each calls only default tools (`review_changes`, `blast_radius`/`test_impact`, `graph`) | [T] |
| COV-26 | one fixture diff per lens check id (9: `new_cross_package_edge`, `new_value_cycle`, `off_limits_touched`, `reuse_missed`, `new_dependency_added`, `untested_new_branch`, `untested_changed_symbol`, `dependents_not_in_diff`, `test_reaches_but_not_run`) + a negative fixture each | fires on the positive, silent on the negative | unit, 18 cases |
| COV-27 | for each of the 11 evidence types, a lens declaring only it | the brief contains only that evidence, from the index | unit |
| COV-28 | `prism lens list/show/edit/seed` | each works; `seed` re-reads facts without touching custom fields | CLI |
| COV-29 | `prism prepare "fix the due date bug" --budget 1200 --json` (rentmaadi) | same output as MCP `prepare_change` | JSON equal |
| COV-30 | session with 10 Prepare calls | `bytesKeptRatio` shown with both raw numbers; `bytesKeptDeltaPp` only beside them | [O] |
| COV-31 | CC session: agent opens 3 of 5 pack files | `followThrough` = 0.6 | [O] |
| COV-32 | `prism receipts show 1 --as markdown` and `--json` | markdown byte-equal to the Action renderer; JSON schema valid | diff |
| COV-33 | each daemon endpoint without a token / with a wrong build header | 401 / build mismatch error; with a valid token → 200 | integration |
| COV-34 | client from a newer build connects | old daemon stopped, new one started; one daemon remains | [E] |
| COV-35 | `idleMinutes:1`, no requests | daemon exits after ~1 min; next client restarts it | [E] |
| COV-36 | battery 15% with `batteryPausePercent:20` (simulated) | indexing paused, reads still served, event logged | [E] |
| COV-37 | `debounceMs:2000`, 50 saves in 1 s | one reindex | [E] |
| COV-38 | `maxWorkspaces:2`, third repo opened | LRU workspace evicted, logged; `maxMemoryMb` exceeded → evict before OOM | [E] |
| COV-39 | `nice:10` | daemon process priority set (Unix), ignored on Windows with a note | ps check |
| COV-40 | repo `.prism/config.json` with `offLimits` globs | Prepare `order.offLimits` and the deny hook honour it | [O] |
| COV-41 | `.prismignore` excludes `legacy/**`; `.gitignore` excludes `out/` | neither indexed nor watched | index file list |
| COV-42 | `prism index --exclude "e2e/**"` | excluded | index list |
| COV-43 | `--max-file-bytes 50000` with a 200 KB generated file | skipped, counted in `filesSkipped` | [O] |
| COV-44 | `PRISM_HOME=/tmp/ph` for every client | all state under it; nothing under `~/.prism` | fs |
| COV-45 | `PRISM_WORKSPACE=/path/b` from a cwd in repo a | b is analysed; logged as source `env` | [E] |
| COV-46 | `PRISM_DAEMON=0` | no daemon; in-process mode; `mode:"inproc"` in outputs | [O] |
| COV-47 | `PRISM_AUTOPREPARE=off` (and `0`) | no pack; `auto` (default) behaves per HK rows | [O] |
| COV-48 | `PRISM_AUTOPREPARE_MS=500` on a cold mono | gives up at 500 ms, logged | [E] |
| COV-49 | `PRISM_SKIP_SELF_UPDATE=1` | no update check event | [E] |
| COV-50 | `PRISM_MCP_PRETTY=1` | tool JSON pretty-printed; same content | diff |
| COV-51 | Node 22 on PATH | `prism install` and `doctor` refuse: `PRISM_UNSUPPORTED: Node 22 found. Install Node 24 LTS.` | exit code |
| COV-52 | each global flag on `prism blast` (json, no-color, quiet, verbose, workspace, yes, help, version) | documented behaviour; `--json` valid JSON with no color codes | CLI snapshot tests |
| COV-53 | Prism internal failure (corrupt index, read-only fs) | exit 3 with an error code | exit code |
| COV-54 | `prism index --ci` / `--all` | CI mode no prompts/no daemon; `--all` reindexes every registered workspace | CLI |
| COV-55 | `prism blast src/lib/dateUtils.ts --fail-on mid` (rentmaadi) | exit 1 | exit code |
| COV-56 | `prism safe-delete`, `prism rename formatDate formatDisplayDate`, `prism test-impact` | JSON equal to the MCP tools | JSON equal |
| COV-57 | `prism deps --packages`; `prism cycles --fail-on 0` with a value cycle | package graph; exit 1 | CLI |
| COV-58 | `prism symbol parseBody --kind function --in src/utils`; `prism refs --symbol`; `prism route a b --alternatives 2` | one row with line; refs resolved; ≤ 2 alternative paths | CLI |
| COV-59 | `prism envelope --days 7` | rows limited to 7 days | CLI |
| COV-60 | `prism memories` lists, `prism forget <id>` | consistent with MEM rows | CLI |
| COV-61 | `prism completions zsh` | contains every 2.0 command, none deleted | contract |
| COV-62 | `prism --no-open` | prints the first-run line, opens nothing | CLI |
| COV-63 | Action with `comment:false`, `upload-sarif:true`, `working-directory:packages/core`, `base:<sha>` | no comment; SARIF uploaded; scoped review; base honoured | job log |
| COV-64 | Action outputs | `review-path` and `sarif-path` exist; exit code propagated | next step reads them |
| COV-65 | `bench:check` after removing deleted ops | no reference to deleted ops; new ops present | contract |
| COV-66 | trigger each of the 16 error codes | correct code, one friendly sentence, troubleshooting anchor exists | unit + docs check |
| COV-67 | `prism review --base origin/main` in CI without consent | uses local refs only; with `network.git-remote` granted it fetches | [E] no `net.*` without consent |
| COV-68 | 6 MB of events | rotated at 5 MB × 3; schema-valid lines | fs + schema |

### A.4 CI contract test `coverage-matrix.contract`
On every PR (part of §9.7), extract from the code:
- MCP tool names, their input keys and enum values (`mcp-server/src/tools/*`)
- prompt and resource names
- CLI command names and flags (`cli/src/registry.ts`, `cli/src/commands/*`)
- hook event names (`plugin/hooks/*`, `hooks.json`)
- `PRISM_*` env vars read via `process.env` (not constants)
- config keys (`daemon/src/config.ts`, `prism-config-load.ts`)
- `PrismErrorCode` values, consent purpose ids, `LENS_EVIDENCE`, lens check ids, Action inputs and outputs (`action/action.yml`), `budgets.json` ops

Each extracted name must appear in column 3 of A.2 with at least one row ID that exists in this plan. The test fails on a new item with no matrix entry, a matrix entry pointing at a missing row, or a matrix item no longer in the code (stale). It also fails if any §0.4-deleted name reappears.

---
## Appendix B. Engineering quality rules and review gate

### B.1 Rules (apply to every PR)
**No hacks**
1. No special case for a repository, a filename, a word or a path we happened to test: no repo names, fixture names or absolute paths in product code. Ranking and routing come from the index (P rules).
2. No silent `catch {}`. Every catch either handles the case per its contract or emits a `degraded`/`error` event with a reason (§2.5).
3. No sleeps, retries or longer timeouts to hide a race. Use a readiness signal (daemon `/v1/status`), a lock, or an ordering guarantee. A retry is allowed only with a documented cause and a bounded count, and it's logged.
4. No test-only branches in product code (`if (process.env.VITEST …)`, as in today's `prism-hook.mjs` `startDaemon`). Inject dependencies instead.
5. No hardcoded user paths, ports, or `~` expansion by string. Use `os.homedir()`, `path.join`, `PRISM_HOME`; Windows paths and spaces are handled by the same code.
6. No raw stderr, stack traces or internal paths in agent-facing text. Use fixed codes plus one sentence (B.3).
7. No network in core analysis (existing trap test). No registry references during development (`no-published-refs`).

**No overengineering**
8. A new abstraction, package, config key, env var, CLI flag, MCP tool or tool parameter needs a user need written in the plan **and** a test row. Otherwise it isn't added. Items cut on this basis are listed in B.4.
9. Prefer deleting or merging over adding. Each phase reports net lines added or removed.
10. One definition per fact (P rules): blast, tests, risk, receipt and Envelope are computed once in core and rendered by every surface.

**Proper solutions**
11. Fix the root cause named in the plan item, not the symptom, and link the item ID (e.g. "fixes R-A1 via §2.2").
12. Every fix has a contract (input, output, failure behaviour) and at least one row that fails before the fix and passes after it. The PR shows the before/after run.

### B.2 PR checklist (in `.github/pull_request_template.md`)
- [ ] Plan item IDs addressed (§, R-, P§, C-, row IDs)
- [ ] Contract stated or unchanged; rows added or updated; they fail on `main` and pass here
- [ ] §9.7 regression gate green; no budget raised without a note
- [ ] No new knob, tool, flag, env var or abstraction without a need and a row (B.1 #8); coverage matrix updated
- [ ] No repo or path special-casing, silent catch, sleep or retry, test-only branch (B.1 #1–5)
- [ ] User-facing text follows B.3; docs and `--help` updated from code (`generate-docs-reference.mjs`)
- [ ] Windows paths considered; idempotent if it writes files
- [ ] Net lines added or removed reported

### B.3 Wording and defaults
- **Error messages:** `<code>: <what happened>. <what to do>.` For example: `PRISM_NOT_READY: Prism is still indexing this repository (62%). Try again in a few seconds.` One sentence each, no internals, every code has a troubleshooting anchor (COV-66).
- **Defaults** are the only documented behaviour; every knob's default is listed in `docs/reference/configuration.md`, generated from code.
- **Log noise:** agent-facing output is silent unless there's a fact. `events.jsonl` has one line per action; `daemon.log` is rotated at 5 MB × 3 like `events.jsonl`; no per-file progress lines (B5).

### B.4 Automated checks (CI, every PR)
| Check | Enforces |
|---|---|
| ESLint `no-empty` + custom `no-silent-catch` (a catch must call `reportDegraded` or rethrow) | B.1 #2 |
| Custom lint `no-test-env-in-src` (forbids `VITEST`, `BUN_TEST`, `NODE_ENV==='test'` outside test files) | B.1 #4 |
| Custom lint `no-hardcoded-paths` (forbids `/Users/`, `C:\\`, `~/` string literals, golden repo names, `17330`-style fixed ports in `packages/*/src`) | B.1 #1, #5 |
| `no-sleep-in-src` (forbids `setTimeout`-based waits outside an allowlist with a comment naming the race) | B.1 #3 |
| `agent-text.contract` (every hook and tool error string matches the B.3 pattern, no stack/path) | B.1 #6, B.3 |
| `coverage-matrix.contract`, `deleted-names.contract`, `skills-tools.contract`, `no-published-refs` | B.1 #8, §0.4, §0.3, §3.0 |
| `docs-reference.contract` (CLI/MCP/config reference pages regenerated from code; diff must be empty) | docs accuracy |
| `windows-paths` (the unit suite runs on windows-latest, required) | B.1 #5 |

### B.5 Items cut or simplified as overengineering
| Item (was) | Now | Why |
|---|---|---|
| `prism doctor --bundle` / `--redact-paths` support zip | cut | no user need recorded; `doctor --json` + `events.jsonl` are enough |
| Daemon "handover" protocol between builds | cut: the newer client stops the older daemon (`/v1/stop`) and starts its own | simpler, same outcome, no protocol |
| N-1 hook/server compatibility | cut: hook and server must be the same version; a mismatch makes hooks silent and `doctor` fail | contradicts "no backward compatibility"; one local build is installed |
| `PRISM_MCP_EXTRA` env var **and** `extraTools[]` **and** `prism config tools` | only `extraTools[]` in `~/.prism/config.json` (written by `prism install` for Cursor/Codex) | three knobs for one setting |
| `PRISM_AUTOPREPARE=always` | cut; values are `auto` (default) and `off` (`0` still works as off) | no need for "always" |
| `PRISM_NODE` | deleted (§0.4); hooks spawn `process.execPath` of the installed Node | redundant with install-time bin resolution |
| Renaming `PRISM_SKIP_SELF_UPDATE` → `PRISM_NO_UPDATE_CHECK` | cut: keep the existing name | rename is churn |
| Lens check `adr_conflict` | cut | needs ADR parsing per repo layout; no test-backed need |
| Lens check `parallel_abstraction` | merged into `reuse_missed` | overlapping signals |
| Lens check `house_style_drift` | cut | heuristic that could never fail a gate (§9.8) |
| Watcher mtime polling of every indexed file | cut: fallback is `git status` polling every 2 s | git already knows what changed |
| 7-day retention of `~/.prism/.removed-1x-*` | cut: the folder stays until `prism uninstall --purge`; the summary line names it | no timer logic |
| `@repo-prism/opencode-plugin` as a new npm package | a file in the plugin pack (`dist/pack/opencode/prism.js`) | no new package |
| `prism stats` | kept | it's the only way the owner can read T2–T5/T10 (SLO need) |

### B.6 Plan re-audit (fixed in this pass)
- **Names unified:** error codes are `PRISM_*` everywhere (A.1); `graph` modes `find|search|refs|neighbors|path|explain`; `agents_md` `generate|check`; the env var is `PRISM_SKIP_SELF_UPDATE`.
- **Contradictions fixed:**
  - CH-16 and S-INS-5 said "works (N-1)" and "daemon hands over". They now say "mismatch → hooks silent, doctor fails, `prism install --local` fixes it".
  - COV-19 used `prism config tools`; it now edits `extraTools[]`.
  - COV-49 used the renamed env var.
  - COV-51 used `PRISM_NODE` (deleted).
  - The lens check count is now 10.
- **Vague → measurable:**
  - "no flapping" = ≤ 1 daemon restart per build change.
  - "≤ 1,500 tokens" for RO-2 is measured from response bytes ÷ 4 (the existing Envelope estimator).
  - "interactive" wording removed with `graph.html`.
  - "a few seconds" in P§1 = T4.
- **Added, previously missing:**
  - Docs and help accuracy (`docs-reference.contract`).
  - Error wording (B.3).
  - Log rotation for `daemon.log`.
  - Big-repo performance: a **50k-file** generated fixture added to B5 nightly. Targets: cold index ≤ 120 s; prompt hook p95 ≤ 1.5 s; RSS ≤ `peakRssBytes` large.
  - Uninstall idempotency (SMK-24, COV-69).
  - Cross-platform paths (`windows-paths`, CH-17).

| ID | Action | Expected | Pass |
|---|---|---|---|
| COV-73 | `prism stats --since 1d` after a harness run | p50/p95 per hook and tool, outcome counts; numbers equal a recount of `events.jsonl` | exact |
| COV-69 | `prism uninstall --purge` twice | second run: "nothing to remove", exit 0 | exit code + output |
| COV-70 | B5 on a generated 50k-file fixture | cold index ≤ 120 s; prompt hook p95 ≤ 1.5 s; RSS ≤ large budget | bench |
| COV-71 | hook v2.0.1 with daemon/server v2.0.0 (local rebuild of one side) | hooks silent, `doctor` fails "version mismatch", `prism install --local` fixes it | [E] + doctor |

---
## Appendix C. Owner smoke test (manual, after implementation)
**Setup:** a clean macOS user account (or a fresh VM) with Node 24 LTS, git, Claude Code and opencode installed. Codex only if `codex login status` succeeds. Clone `rentmaadi`, `hono` and `es-toolkit` at the golden SHAs into `~/smoke/`. Build Prism locally once: `cd /Users/shaileshjha/Prism && bun install && bun run build`. All steps use the local build (§3.0).

**Abnormal = stop and file a bug.** Any of:
- **Noise:** "warming"/"still indexing" text, raw stderr, stack traces, progress spam, more than one line from a hook when there's nothing to say.
- **Wrong files:** a pack whose top file isn't the one you'd open; tests from unrelated modules; blast listing barrel importers of other exports.
- **Slow:** prompt hook > 1.5 s warm, receipt > 3 s warm, `doctor` > 5 s, any tool > 2 s warm on these repos.
- **Stale:** an answer that doesn't reflect an edit you made 2 s earlier, or a branch you switched to.
- **Confusing errors:** any message not in the `PRISM_X: what. what to do.` form.
- **Leftovers:** any mention of health, reports, dispatch, hub, jobs, map, features, `prism-ship`, Prismate, `graph.html`; a tool not in the 9; port 17330 open; `npx`/`@latest` in any config; files outside `~/.prism` and the editors' config after uninstall.

| ID | Step | Command / prompt | Expected |
|---|---|---|---|
| SMK-1 | Install for Claude Code | `node /Users/shaileshjha/Prism/packages/cli/dist/cli.js install claude --local /Users/shaileshjha/Prism` | one line: `Prism 2.0.0 installed for Claude Code (local build <sha>).` No wipe line on a clean machine |
| SMK-2 | Install opencode | `prism install opencode --local …` | one line; `opencode.json` has `mcp.prism` with an absolute `node …/bin.js` |
| SMK-3 | Install Codex (if configured) | `prism install codex --local …` | one line, `~/.codex/config.toml` entry, managed `AGENTS.md` block. If Codex isn't configured: `Codex not found; skipped.` |
| SMK-4 | Doctor | `prism doctor` | all green, ≤ 5 s: Node 24, bin path, each editor pinned to the local build, hooks installed, daemon not yet running (OK), no published refs |
| SMK-5 | First index | `cd ~/smoke/rentmaadi && prism` | `Indexed N files in T s. Try: prism review` with T ≤ 20 s; no browser opens; no health card |
| SMK-6 | Tool list | in Claude Code: `/mcp` | prism shows exactly 9 tools |
| SMK-7 | Orient | CC: "I just cloned this, what is it and where do I start?" | session start injected an orientation (≤ 300 tokens); the agent calls `repository_overview` at most once; it names Next.js, `apps/web`, the date utils |
| SMK-8 | Bug fix | CC: "on the due day the tenant dashboard shows next month" | before the first edit the context names `apps/web/src/lib/dateUtils.ts` + Dev lens; the agent edits that file; at stop a receipt line: `Prism receipt: changed 1 file, 3 dependents, N tests reach it — proven` (or `not_proven(no_node_modules)` if deps aren't installed), within 3 s |
| SMK-9 | Freshness | edit `dateUtils.ts` by hand, then ask CC "who imports dateUtils?" | answer reflects the edit; 3 pages |
| SMK-10 | Rename | CC: "rename formatDate to formatDisplayDate across the app" | `rename_impact` before edits; all sites changed; `npx tsc --noEmit` passes; receipt proven or not_proven(reason) |
| SMK-11 | Delete | CC: "delete public/sw.js if nothing uses it" | `safe_delete` says it's referenced by path; the agent doesn't delete it and explains why |
| SMK-12 | Off-limits | CC: "fix the typo in the generated prisma client" | edit denied with the reason; no other warnings |
| SMK-13 | Sign-off warning | CC: "change getNextRentDueDate to return a Date" | one warning line on edit; the edit goes through |
| SMK-14 | Question, no pack | CC on hono: "how does src/hono.ts reach src/compose.ts?" | no pack injected; one `graph` call with mode `path` |
| SMK-15 | Non-English | CC: "डैशबोर्ड पर due date गलत है, ठीक करो" | one line: English-only note; no pack |
| SMK-16 | PR review | `git checkout -b smoke && git commit -am wip`; CC: "review my changes before I open a PR" | Architect lens; `review_changes`; findings cite the 3 pages; a PR description with Impact and Verification, no invented test runs |
| SMK-17 | Custom lens trigger | `prism lens add perf --name Perf --checks untested_changed_symbol --trigger "slow query"`; CC: "the tenant list has a slow query, fix it" | Perf lens injected (named in context); `prism lens list` shows it; nothing written in the repo |
| SMK-18 | Lens conflict | `prism lens add db --trigger "slow query on postgres"`; CC: "fix the slow query on postgres in reports" | db chosen; one conflict line naming both |
| SMK-19 | opencode day | in opencode on es-toolkit: "trailing debounce call should use the latest arguments" | pack names `src/function/debounce.ts` + `debounce.spec.ts`; receipt on `session.idle` |
| SMK-20 | Codex (if configured) | in Codex on hono: "add a maxAge option to the cors middleware" | agent calls `prepare_change` before editing and `receipt` before finishing (rule path); verdict quoted |
| SMK-21 | Branch switch | `git checkout main` mid-session in rentmaadi, then "who imports dateUtils?" | within 15 s, answers reflect main; hooks silent meanwhile |
| SMK-22 | Envelope and receipts | `prism envelope --session`; `prism receipts` | calls and tokens match what you saw; `saved: not calibrated` (or calibrated with a method link); receipts listed with verdicts |
| SMK-23 | Prune | `prism data prune` then `prism data prune --yes` | dry run lists stale items only; `--yes` removes exactly those; lenses kept |
| SMK-24 | Uninstall | `prism uninstall --purge` (twice) | first: one summary line; daemon stopped; editor configs cleaned (managed entries only); `~/.prism` and repo `.prism/` gone. Second: "nothing to remove" |
| SMK-25 | Leftover sweep | `lsof -i :17330`; `grep -r "repo-prism\|prism" ~/.claude ~/.cursor ~/.codex ~/.config/opencode`; `ls ~/.prism` | nothing open; no Prism entries; no `~/.prism` |

---
## Appendix D. Readiness review (three passes, 2026-10-14)

### D.1 Pass 1: correctness against the code
- **Line references corrected.** Verified on the working tree. `prism-hook.mjs` moved by a few lines:
  - `mcpBin()` 238–248 (was 236–246)
  - `stop_hook_active` 251 (was 249)
  - `startDaemon` pid probe 294 (was 284–285)
  - `VITEST` test-only branch 288
  - `CHANGE_VERB` 373 (was 368)
  - `prompt()` 377–392
  - `PRISM_AUTOPREPARE_MS` 383
  - git baseline timeout 326

  Confirmed: `hook-command.ts:215` (in-process open), `pool.ts:122` (`fs.watch`), `auto-update.ts:18,39,100,108`, `verify.ts:59`, `.nvmrc` = 24.18.1, `SIGN_OFF_RISK = 60` (`safety/snapshot.ts:45`). **Rule for implementers:** line numbers are hints. The function names are authoritative, because the tree is uncommitted and will move.
- **Commands that don't exist yet** (they are new in this plan, not existing): `prism install`, `uninstall`, `upgrade`, `overview`, `lens`, `stats`, `doctor --fix`. Today's CLI has `doctor` (with `--surfaces`), `index`, `prepare`, `remember`, `memories`, `forget`, `packages`, `data`, `completions`, `graph` (`status|export|open|hooks install|uninstall`), `receipts`, `envelope`, and the deleted report commands. §5.9 now marks the new ones as **new**, each with its contract row: S-INS, CL, B8, DOC.
- **Found in code, not in the plan:** `prism graph hooks install|uninstall` writes `post-checkout`, `post-merge` and `post-commit` git hooks into the user's repo (`cli/src/commands/graph.ts:38,274-319`). **Decision under B.1 #8: delete.** The daemon's HEAD watch (§2.4) covers branch switches without writing into user repos. Added to §0.4 as #37. `prism graph status` is kept (COV-72).
- **MCP resources:** 4 registered in `resources.ts` (lines 25, 50, 75, 100). Each must map to kept data or be deleted (COV-20 already covers this).
- **`.github/pull_request_template.md` doesn't exist.** B.2 creates it.
- **`docs:check` already runs `generate-docs-reference.mjs --check`** (`package.json:47`). `docs-reference.contract` (B.4) reuses it instead of adding a new script.

### D.2 Pass 2: scenario and edge-case completeness
Every feature is walked through the states below. Rows already covered are referenced; the new ones are EDGE-1…40.

| State | Covered by |
|---|---|
| cold start / ready / stale / crashed | CH-1, CH-2, CH-6, CH-11, CH-13 |
| offline / proxy | CH-4, CH-5 |
| concurrent sessions / editors | CH-9, CH-10 |
| huge repo (10k, 50k) / huge diff | B5, COV-70, RC-3, RE-8 |
| empty repo, non-git folder, worktree, submodule, symlinks, case-insensitive FS, unicode/spaces, read-only, disk full, CRLF | EDGE-1…12, CH-14, CH-21, CH-23 |
| package-manager workspaces bun/pnpm/yarn/npm | EDGE-13…16 |
| tsconfig missing / multiple / `extends` / `references` | EDGE-17…19 |
| JS-only, ESM vs CJS, `.mjs/.cjs`, `exports` conditions | EDGE-20…23 |
| path aliases, barrels, dynamic imports, generated, vendored | RN-1, BR-1, EDGE-24…27, PC-11 |
| every hook on every agent | EDGE-28…33 |
| every error path | COV-66, EDGE-34…40 |

| ID | Scenario | Expected | Verify / pass |
|---|---|---|---|
| EDGE-1 | empty git repo (no commits, no files) | index ok with 0 files; tools return empty results, no errors; prompt hook silent | [O][E] |
| EDGE-2 | non-git folder with TS files | index works; baseline from mtime (CH-21); `review_changes` without `paths` → `PRISM_NO_GIT` with the fix | [O] |
| EDGE-3 | git worktree (`git worktree add ../wt`) | separate workspace key per worktree root; HEAD watch uses the worktree's gitdir | [E] |
| EDGE-4 | repo with a submodule containing TS | submodule is indexed as its own workspace only if opened; parent excludes it (gitlink) | index list |
| EDGE-5 | symlinked source folder inside the repo pointing outside | not followed (no escape); symlink listed as skipped | [O] |
| EDGE-6 | symlink loop | no hang; skipped once with an event | timing + [E] |
| EDGE-7 | macOS case-insensitive FS: import `./Utils` for `utils.ts` | resolved with a `case-mismatch` hint (would break on Linux) | [O] |
| EDGE-8 | two files differing only by case on Linux | both indexed, distinct keys | [O] |
| EDGE-9 | repo path `~/smoke/my repo/ü-app` | all features work; keys stable across runs | SMK subset |
| EDGE-10 | read-only repo folder (permissions) | analysis works (state lives in `~/.prism`); `agents_md generate` → `PRISM_IO_ERROR` with the path | [O] |
| EDGE-11 | `~/.prism` on a full disk | `degraded` events; tools answer from memory or return `PRISM_IO_ERROR`; daemon doesn't crash-loop (≤ 1 restart/min) | [E] |
| EDGE-12 | CRLF files and a BOM | identical symbols, lines and hashes as LF | unit |
| EDGE-13 | bun workspaces (`package.json` `workspaces` + `bun.lock`) | packages and cross-package edges | [O] |
| EDGE-14 | pnpm (`pnpm-workspace.yaml`, `workspace:*`) | same | [O] |
| EDGE-15 | yarn berry PnP (no `node_modules`) | workspace packages resolved from manifests; third-party imports counted unresolved, not errors | [O] |
| EDGE-16 | npm workspaces | same as EDGE-13 | [O] |
| EDGE-17 | no tsconfig (JS project) | relative and `package.json` resolution only; no alias errors | [O] |
| EDGE-18 | multiple tsconfigs (`tsconfig.app.json`, `tsconfig.node.json`, solution `references`) | each file resolved with the nearest owning config; aliases per project | [O] |
| EDGE-19 | tsconfig `extends` from a package (`@tsconfig/node24`) | followed when installed; otherwise a warning, analysis continues | [O] |
| EDGE-20 | JS-only repo (`.js` + JSDoc) | full support per §4.6 | PC/BR on preact |
| EDGE-21 | ESM `import` vs CJS `require` / `module.exports` | both create edges; `require` of a JSON file ignored | [O] |
| EDGE-22 | `.mjs` / `.cjs` / `.mts` / `.cts` extensions in imports | resolved | [O] |
| EDGE-23 | `exports` conditions (`import`/`require`/`types`/`default`, subpath patterns `./*`) | resolved per §4.1 order | [O] |
| EDGE-24 | barrel with `export *` and `export { x as y }` | symbol-level blast follows the renamed export | [O] |
| EDGE-25 | dynamic `import("./x")` literal vs template `import(\`./${n}\`)` | literal → edge; computed → listed in `unresolvedImports` with reason `dynamic` | [O] |
| EDGE-26 | generated code (`// @generated`, `*.gen.ts`, prisma client) | `offLimits`; included in blast but marked generated | [O] |
| EDGE-27 | vendored (`vendor/`, `third_party/`) | `offLimits`; excluded from findings and orphans | [O] |
| EDGE-28 | CC: every hook with `PRISM_HOOKS=0`, not installed, ready, stale, crashed daemon | per HK-* contracts; never an error to the agent | harness |
| EDGE-29 | opencode: `chat.message`, `tool.execute.before/after`, `session.idle` in each state of EDGE-28 | same outputs as the CC equivalents | harness |
| EDGE-30 | Codex (if configured): rule path in each state | `prepare_change`/`receipt` tool answers per contract; `PRISM_NOT_READY` when cold | harness |
| EDGE-31 | Cursor (rule path, `stop` hook where available) | same as EDGE-30 | harness |
| EDGE-32 | hook given malformed stdin JSON | `{}`, `degraded` event, exit 0 | unit |
| EDGE-33 | hook exceeds its budget (simulated slow daemon) | killed at budget, `{}`, `prompt.timeout` event | [E] |
| EDGE-34 | each tool with invalid input (wrong type, missing required, path traversal) | `PRISM_VALIDATION` / `PRISM_INVALID_PATH`, one sentence | unit per tool |
| EDGE-35 | target not found (`blast_radius {target:"nope.ts"}`) | `PRISM_NOT_FOUND` with nearest matches | [O] |
| EDGE-36 | index required but missing (`PRISM_DAEMON=0`, cold) | `PRISM_INDEX_REQUIRED` → indexes on demand when ≤ 5k files, else the error with `prism index` | [O] |
| EDGE-37 | analyzer crash on one malformed file | file skipped, `PRISM_ANALYZER_FAILED` counted in coverage, rest of the index ok | [O] |
| EDGE-38 | client cancels a long call | `PRISM_CANCELLED`, daemon stays healthy | [E] |
| EDGE-39 | git command fails (corrupt `.git`) | `PRISM_NO_GIT` path, baseline from mtime | [O] |
| EDGE-40 | `PRISM_HOME` unwritable | install refuses with path and fix; tools fall back to in-memory, warn once | exit code |
| COV-72 | `prism graph status` | daemon and index status for this repo, ≤ 1 s | CLI |

### D.3 Pass 3: plan quality and executability
- **Order:** Step 0 (approved checkpoint) → Phase 0 (baselines) → Phase 1 → {2→3} ∥ {4} → 5 → 6 → 7 → 8 → Release 2.0.0. Every phase lists its close-out items (C-n) and passes §9.7 before merging. No phase depends on a later one. Verified: hooks (5) need the daemon (4) and Prepare (3); the tool consolidation (6) needs the engine (2); install (7) needs bin resolution (1).
- **Every item has a contract, rows and a done criterion.** Exceptions found and fixed:
  - `prism stats` had no row → COV-73.
  - The opencode plugin file had no row → EDGE-29.
  - `prism graph status` had no row → COV-72.
  - The PR template had no check → B.4 now verifies it exists.
- **Contradictions found and fixed:**
  - §5.9 listed `upgrade` as existing (it's new).
  - CLI-4's "use `prism overview`" hint conflicts with "no hints" (§0.3) → CLI-4 expects the plain unknown-command error (already the case).
  - Git hooks in user repos vs the daemon HEAD watch → git hooks deleted.
- **Hacks or overengineering:** none newly added in this pass. One item flagged: on-demand indexing in EDGE-36 is capped at 5k files so a tool call can't hang. That's a contract, not a knob.
- **Executability:** an implementer needs these inputs that aren't in the repo:
  - (a) Golden-repo SHAs. They're recorded in `scripts/e2e-agent/repos.json` in Phase 0. `rentmaadi` must be cloneable by CI: see Blockers.
  - (b) Classifier corpus prompts from the owner's sessions. These are collected in Phase 0 with opt-in.

  Everything else is specified.

### D.4 Residual risk and how we bound it
"Zero bugs in any scenario" can't be proven. We bound the risk with measurable gates, all part of §9.5:
1. **Property and fuzz tests:**
   - The resolver and parser get `fast-check` generators for random import graphs (aliases, barrels, `exports` maps, cycles, case variants, CRLF). Invariant: edges equal what `tsc --traceResolution` resolves, on 10,000 generated cases per nightly run with 0 mismatches.
   - Prepare: the budget cap (PC-9) and determinism (same input → byte-identical output).
   - Hook stdin fuzzing: 10,000 malformed payloads → always `{}` and exit 0.
2. **Mutation testing:** Stryker on `packages/core`, `impact`, `graph-engine`, `indexer` (resolver), `shared/lens-route`, `mcp-server/src/safety`. Gate: mutation score ≥ 75% overall and ≥ 85% on the resolver, blast and receipt modules.
3. **Coverage:** line ≥ 85% and branch ≥ 80% on the same packages; 100% of `PrismErrorCode` values triggered by a test (COV-66).
4. **Soak test:** the daemon runs 24 h on the Prism repo and the 50k fixture with a scripted edit and branch-switch loop (one edit every 5 s, a branch switch every 10 min) plus 4 concurrent sessions. Gate:
   - RSS growth ≤ 10%
   - 0 crashes, 0 stale answers (checked against a fresh index every hour)
   - p95 latencies within T2–T5 throughout
   - `events.jsonl` with 0 `error` outcomes and `degraded` ≤ 0.1% of events
5. **Bug bash:** the owner runs Appendix C on macOS, plus a second person on Windows and Linux. Gate: 0 open P0/P1 bugs. P2s are either fixed or written up in known limitations with the owner's sign-off.
6. **Transcript harness stability:** all §5 rows at the defined pass rule in 3 consecutive nightly runs.
7. **Known limitations, stated:** static analysis can't see runtime DI or computed dynamic imports (`docs/help/known-limitations.md`), and the answer flags them through `unresolvedImports`. TS/JS only. English prompts only. Agent behaviour ([T] rows) is probabilistic, so it's gated at ≥ 2/3 runs.

**Release gate additions (§9.5 items 11–14):** 11. D.4 items 1–4 green. 12. Bug bash with 0 P0/P1. 13. Readiness re-run of D.1 (every cited path and function exists, by a script that greps them). 14. Owner sign-off.

### D.5 Verdict
**Ready to execute** as a plan. **Not yet a release:** nothing is built.

**Blockers before Phase 0:**
- (1) Owner approval of the Step 0 checkpoint commit. About 60 uncommitted files, and AGENTS.md requires approval.
- (2) `rentmaadi` must be reachable by the harness and CI. If it's private, CI needs a read-only deploy key, or the rentmaadi rows run on the owner's machine only (nightly local runner).
- (3) The owner opts in their session prompts for the classifier corpus (B7).

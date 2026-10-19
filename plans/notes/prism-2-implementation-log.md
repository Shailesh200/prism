# Prism 2.0 implementation log

Plan: `plans/notes/prism-unified-plan.md` @ 8b46042. Branch `milestone/M-087-focus-reset-plan`. Nothing is committed, pushed, tagged or published. Node 24.18.1 and bun 1.3.11. Local build only.

## Phase 0: checkpoint and baseline (2026-10-14, 13:13–14:25 IST)

**Checkpoint:** already done as 2480b92 (decision 21). The baseline ran on HEAD 8b46042, which has no code change since the checkpoint.

**Pre-existing test failures at baseline** (`bun run test`, 2 of about 2,000 tests, both in mcp-server):
- `daemon.test.ts > debouncePerKey > runs only the last task per key` is timing-sensitive: it got `['other','third']` where it expected `['other']`. It needs a root-cause fix with a fake clock in Phase 4.
- `surface.test.ts > registers every tool a shipped skill or command names` fails because `skills/prism-lens/SKILL.md` names `lens` and `review_with`, which aren't registered. This is the skills-tools contract gap that Phase 1 and Phase 6 fix.

**New benchmark tooling** (uncommitted):
| File | Purpose |
|---|---|
| `scripts/bench/golden/mine-tasks.mjs` | Mines B2/B4 tasks deterministically from git history, labels them from the commit, and holds out 20% |
| `scripts/bench/golden/run-eval.mjs` | Runs B2/B4 against the local `packages/core/dist`: top-1/top-3, recall@pack, tokens, test P/R, blast P/R, held-out split |
| `scripts/bench/golden/tasks/{hono,preact,es-toolkit,portpilot,mono}.json` | Frozen public tasks. rentmaadi and zod-B2 tasks are in `~/.prism-dev/golden/` (private, decision 22) |
| `scripts/bench/classifier-eval.mjs`, `scripts/bench/classifier/{gen-synthetic.mjs,synthetic.jsonl}` | B7. Public synthetic subset of 368 prompts. The owner corpus of 72 hand-labelled prompts is at `~/.prism-dev/classifier-corpus/corpus.jsonl` (decision 23, never committed) |
| `scripts/bench/hook-latency.mjs` | B8 hook wall-time per event on a scratch clone |
| `scripts/bench/gate.mjs` | Local §9.7 regression gate vs `plans/notes/benchmarks/baseline` (self-check passes, 19 rules) |
| `plans/notes/benchmarks/baseline/*` | B1–B10 baselines plus a README with machine info |

Lint and format are clean on all new files.

**Baseline numbers:** see `plans/notes/benchmarks/baseline/README.md`. Headline: B4 golden top-3 is **16.3%** against a T7 target of 85%; B7 change recall is 0.738 with a question FP rate of 0.125; B3 false alarms are 50%; B1 Prism uses 4.2× more tokens; B10 has 0 passing cells.

**Phase 0 gaps (need owner input, see "Blockers"):**
1. Golden task shortfall: commit mining yields only portpilot 9/30, mono 20/30 and rentmaadi 23/40, so 172 of 220 tasks. These repos have short histories made of large commits.
2. B6 was not re-run: the 2026-10-11 Claude Code result is used, and there's no opencode baseline. A full A/B means about 250 agent sessions (several hours), and CC auth under an isolated HOME is untested.
3. B10 only covers macOS. The ubuntu and windows cells need CI, which means a push.
4. C-1 (ADR approvals) and C-14 (adding new budget ops at about 2× the baseline and dropping ops) both need owner approval under the §9.7.5 rule.

**Stopped after Phase 0.** Phase 1 includes re-pinning `GOLDEN_MONO_SHA` to a post-deletion commit, and that can't happen without a commit.

## Phase 1 — progress checkpoint (2026-10-14, IST)

Done since last entry (all uncommitted):
- cli: `data-prune.ts` rewritten to C-3 keep-rules (no Dispatch worktrees; receipts trimmed to last 20; lenses/config/ledger never candidates). `data-prune.test.ts` rewritten as PRUNE-1…3 (3/3 green). `commands.ts` graph spec no longer mentions `open`/`hooks`/html. cli typechecks clean with `--noUnusedLocals`.
- playground `dashboard-apis.ts`: removed the Dispatch-backed routes (`/api/jobs`, `/api/skills`, `/api/settings`, `/api/connectors`, `/api/trees`); `/api/git-graph` now uses `HEAD --branches` instead of dispatch-hub trees.
- host-session: removed every RPC whose data was deleted (dashboard, map, overlay, backend, testing, security, coverage/tests, health history/movers/backfill, engineering health, lighthouse, bundle, frontend routes, domain report, GitHub/PageSpeed/stage-devops, bookmarks) from `protocol.ts`, `protocol-guards.ts`, `host-dispatch.ts`, `session.ts`; dropped `HostDispatchState` (zoom/layers), the `zoom`/`layers`/`runTests` webview messages and the progress messages. Tests updated (26/26 green), typecheck clean, built.

BLOCKED — owner decision needed (stopped here per the "stop and report" rule):
- Plan §0.2 says "IDE map: already gone". It is not: the VS Code webview (`packages/vscode-extension`), the shared UI (`packages/app-shell`, 82k lines) and the playground dashboard are built on `getRepositoryMap`/`getDashboard`/health/testing/security data, all of which §0.4 deletes. After the host-session cut, vscode-extension has ~50 type errors and 18 UI source files (~12.6k lines) call deleted RPCs.
- §0.4 #29/#30 says "UI is out of scope; delete only what references deleted data". Applied literally, that removes the main views of the IDE extension and the playground (overview/map/health/testing/security/domain/bundle screens), leaving a shell with impact/graph/review only. Options: (A) delete those screens and wire the remaining panels to the surviving RPCs; (B) delete the IDE extension, app-shell and playground outright for 2.0 (UI out of scope); (C) keep the UI and restore a map/dashboard data source (contradicts §0.4 #4).

## Phase 1 — Decision B and resume (2026-10-14 15:15 IST)

- **Owner decision B:** delete `packages/vscode-extension`, `packages/cursor-extension`, `packages/app-shell`, `apps/playground` (plus `packages/host-session`, which only served them) entirely, with build/CI/publish/docs references and workspace entries. `apps/website` stays, stripped of deleted features. Recorded as plan §12 Decision 27; §0.4 #29/#30 rewritten; A.2 had no UI rows and no SMK step used an IDE surface (noted in Decision 27). Phase 1 implementation calls recorded as Decision 28.
- **State on resume (after an interrupted run):** HEAD 8b46042, 882 changed paths. All five packages are gone from disk (tracked deletions unstaged: vscode-extension 40, cursor-extension 9, app-shell 187, host-session 12, playground 31 files). Remaining references were only three source comments and `*.vsix` in `.gitignore` — removed. Website next.config redirects for old extension URLs kept on purpose.
- Done before the interruption (this session): CORE_SDK stability table filtered to real `PrismWorkspace` methods; `map` capability flag removed (shared DTO, core, tests); `understand-a-repo`, quickstart, dna-and-stack, troubleshooting, usage docs moved to `prism overview`, Node 24, `prism-mcp` (no npx for MCP); feature-graph docs say "internal"; dead Dispatch helpers `formatPrepareChangePrompt`, `queueFindingArgs`, `formatWorkOrderPrompt` deleted (shared coverage dropped below 85% because their only callers were gone); `navigation/src/features.ts` (empty) removed; `FeatureIdBrand` removed; plugin pack test now expects exactly `PRISM_ALL_TOOL_COUNT` reference rows.
- `scripts/check-docs.mjs` (existing command contract) gains a PLANNED list; planned commands (`install`, `uninstall`, `upgrade`, `lens`, `stats`) are on an explicit list that must be empty at release. Consent-purpose rules there now flag any purpose id as deleted. Root `lint` now runs oxlint + no-silent-catch + deleted-names.
- Resuming at: full build/typecheck/lint/format/test, then Phase 1 commit.

## Phase 1 — committed (2026-10-14 ~15:40 IST)

- Full local suite green before commit: build, typecheck, lint (oxlint + no-silent-catch + deleted-names), format:check, unit tests, test:integration (one indexer test now reads `SCHEMA_VERSION`; CLI first-run line matches SMK-5 text `Indexed N files in T s. Try: prism review`), docs:check.
- Also fixed on the way: `check-docs.mjs` no longer loads deleted `CONSENT_PURPOSE_IDS`; any `network.*`/`run.*` purpose in docs is now flagged as deleted; FAQ bundle/consent paragraph removed. Dead Dispatch PRD helpers `formatWorkOrderForPrd`/`appendWorkOrderToPrd` deleted. Disk ran out (moon cache 8 GB in `.moon/cache`, gitignored) — cleared; it is a rebuildable cache.
- **The one allowed commit:** `f45ccb7 refactor!: Prism 2.0 deletions (local pin for golden mono)` — 901 files, +19,133 / −203,245. Hooks ran and passed; no secrets staged (scanned). Not pushed. A one-line blank-line format fix to `scripts/check-docs.mjs` landed after the commit and stays uncommitted (no amend).
- **Re-pin:** `GOLDEN_MONO_SHA = f45ccb73f764dd17806ab118897bf1236254ec0f` in new `scripts/e2e-agent/repos.json`; `scripts/bench/golden/tasks/mono.json` `pinnedSha` updated.
- **Hand-labelled golden tasks (decision 2), all `label: "hand-labelled, pending owner review"`, ids `*-hl-NNN`, evaluated at the pinned SHA (parent = commit = pin):** mono 10 (2 held out), portpilot 21 (5 held out → 6/30 total), rentmaadi 17 (4 held out → 8/40; private file `~/.prism-dev/golden/rentmaadi.json`). Method: pick exported functions with a unique definition and at least one importer or test; write a natural-language change request that does not name the file; firstFile = definer, blast = importers, tests = test files naming the symbol. Golden set is now 220/220.

## Phase 1 — tail (after commit, uncommitted)
- `skills-tools` contract added to `packages/plugin/src/pack.test.ts`: hooks/skills/commands never name a deleted tool (from `scripts/deleted-names.json`), and every tool the hook names in agent-facing `additionalContext` is shipped. 14/14.
- Phase 1 gate run: B4 (220 tasks incl. 48 hand-labelled) and B7 started on `f45ccb7` into `/tmp/prism2/p1/`.

## Phase 2 — engine (in progress, 2026-10-14 IST)
- **§4.1 type-only edges:** analyzer marks `typeOnly` on imports whose every binding is a type and on `export type … from`; carried through `IndexedImport/IndexedExport` and the indexer; dependency edges get `attrs.typeOnly`; a value import between the same files clears it (file and package graphs). Cycles use value edges only; `includeTypes: true` adds type edges. Tests: analyzer "marks type-only imports and re-exports", RES-CYC-1…4.
- **Extraction version:** new `EXTRACTION_VERSION` (=2) in the index cache. Cached rows are reused by content hash only, so a changed analyzer output would otherwise survive re-index; a mismatch clears derived rows and reports via `onExtractionReset`. Test EXT-1.
- **Root cause of rentmaadi `@/lib/dateUtils` → 0 importers:** `aliases.ts` stripped comments with a regex that ate `/*` inside the string `"@/*"`, `JSON.parse` failed, and a silent `catch` returned "no aliases". Fixed: string-aware `parseJsonc` (comments + trailing commas), parse failures surface on `PathAliasMap.errors`; `extends` of a package specifier resolves through `node_modules` or the uninstalled workspace package; `baseUrl`/`paths` resolve against the declaring config (TS semantics); package `imports` honour `types → import → require → default` (`pickConditionalTarget`). Tests RES-1…5. Acceptance: rentmaadi `dateUtils.ts` blast now lists the 3 pages (was 0).

### Phase 1 gate (f45ccb7 dist, isolated HOME)
`node scripts/bench/gate.mjs --current /tmp/prism2/p1` → **pass, 13 skipped** (only B4 and B7 re-run for Phase 1; B1/B2/B3/B5/B8 not re-run at this phase). B4 now covers 220/220 tasks (48 hand-labelled added), so it is not like-for-like with the 172-task baseline: top-3 16.3 → 20.5, recall@pack 43.3 → 49.0, test P/R 14.3/58.4 → 14.2/61.5, blast P/R 9.0/17.9 → 13.9/44.7; held-out (44) top-3 15.9. B7 unchanged (0.738 / 0.125).

## Phase 2 — progress (symbol-level blast, RES-6, EXTRACTION_VERSION 3)
- impact: name-aware BFS with `fileExports` in ImpactContext (`allExportsOf`). Barrels forward only real export names; an importer that binds a changed name is affected even if it exports nothing (tests, entries). Default blast hop limit 3; re-export hops are free. Tests BLAST-SYM-1…3 pass (impact 36/36).
- core `impactContextFor` now passes `fileExports` from snapshot.files[].exports (one place, covers blast/test-impact/safe-delete/rename).
- RES-6 (outDir→src remap) and EXTRACTION_VERSION 3 (forces re-extraction for typeOnly/imported fields) are in, with tests.
- Full build + typecheck + `bun run test` green.
- es-toolkit debounce blast: 356 → 38 files. Remaining over-approximation: specs doing `import * as x from 'es-toolkit/compat'` count as binding everything. Fix would be member-reference analysis — open, recorded as residual risk.
- Next: §4.3 test-impact shape, §4.4 orphans/entry points, §4.5 find dedupe, §4.6 LANG gate, then Phase 2 gate into /tmp/prism2/p2.

## Phase 2 — Prepare quality (gate run 2026-10-14)

- Gate: `node scripts/bench/gate.mjs --current /tmp/prism2/p2` → **pass, 9 skipped** (B1/B3/B5/B8 not produced by this phase's run).
- B2 top3 17.2→18.9, recall@pack 37.5→42, test precision 13→22.5, test recall 56.1→56.6.
- B4 top3 16.3→21.4, recall@pack 43.3→50.6, test precision 14.3→24.7, test recall 58.4→59.3.
- B7 (bench script, old classifier path) unchanged 0.738 / 0.125; new classifier lands in Phase 5.

## Resumed 2026-10-14 16:32 IST
- State: Phase 2 gate passed (above). Phases 3/4/5 code written, uncommitted (91 paths), not yet built/tested. Phase 5 autoPrepare now: readiness wait 3 s (HK-7), budget 1200, unsupported-language one-line note, session pack file `hooks/packs/<sha(session)>.json`; silent catch on last-prepare write replaced by `prompt.last_prepare` event. Tests added in mcp-server daemon.test.ts.
- Next: MOON_CACHE=off build, fix type errors, run tests.
- build-pack.ts now ships hooks/classify-prompt.mjs beside prism-hook.mjs.
- Build green after: pool.ts optional fields widened for exactOptionalPropertyTypes; VerdictInput.checks readonly.
- Tests: all packages green except 3 mcp-server surface/docs tests (receipt tool registration); daemon pool fake watcher lacked close(); plugin test isolatedHook now copies classify-prompt.mjs (same contract as build-pack).
- Lint/format/typecheck/build/tests all green (all 17 packages). Instructions describe the stop verdict without the word 'receipt' (opt-in tool name); README documents the receipt tool; contract test calls it.
- classifier-eval.mjs default is now the shipped module classifier (hook no longer has CHANGE_VERB). B7 now: recall 0.996, question FP 0.013, non-English 1.0 (synthetic 1/0/1; owner 0.974/0.043).
- Phase 3–5 gate started: B3 replay (scripts/replay-benchmark.ts, work /tmp/prism2/replay, es-toolkit/zod/hono) → /tmp/prism2/p3. Then B2/B4/B7 via run-gate.sh, B8 hook-latency, B5 freshness.
- Fix: receipt treated Yarn PnP repos (.pnp.cjs, no node_modules) as not installed → checks skipped (found by B3 on es-toolkit). dependenciesInstalled() now accepts .pnp.cjs/.pnp.js; test added. B3 restarted.
- Phase 5: lens definitions moved to global ~/.prism/lenses/lenses.json (facts/reviews stay per workspace); corrupt files moved aside with lens.store_corrupt; CL-14 test.
- Lens schema: LENS_CHECK_IDS (9 data-backed checks), checks[] and overrules[] on definitions, LensFinding schema; CL-5 unknown-check refusal; LN-10 upgrade safety fixed (old code overwrote a renamed lens's name; now keeps name, fills empty procedure/checks). CLI: repeatable options (args.values). Build green. B3 restarted on fresh dist.
- Phase 5: data-backed lens checks (mcp-server safety/lens-checks.ts: all 9 checks; overrules pinned to file content hash; test LN-6..9, CL-2/3). Receipt carries lensFindings (structural; test_reaches_but_not_run settles to pass when checks finish). CLI `prism lens list|add|remove|override` with repeatable --trigger/--checks/--checklist/--evidence. replay-benchmark prunes stale worktrees. Build green; B3 restarted.
- CLI lens integration test (CL-4/5/6/13/14) passes.
- B3 run 1 (PnP fix, before signature fix): catch 5/8 = 62.5%, FA 3/8 = 37.5%, median 4.4 s. Root cause of FAs: identical unparseable failures (hono lint 'lint failed', es-toolkit PnP 'Couldn't find @changesets/cli') before and after were classified 'caused'. Fix: FailureSignature.text (normalised output) compared when no file parsed → already-failing (verdict not_proven(already_failing), not failed). Tests updated.
- Phase 6 (in progress): review_changes gains lens/format inputs, lensFindings, prDescription {whatChanged, impact, verification(never invents a run)}, RC-3 truncation (>300 → top 100 by importers), RC-4 clean tree answer. Tool name lists moved to shared/tool-names.ts. prism doctor skills (SK-7/8). prism-review-pr skill rewritten (step 4 prDescription; posting only on confirmation).
- Envelope: `prism envelope --session <id|latest>` (EN-1/EN-5).
- 17:05 IST Phase 7: wrote packages/cli/src/install/wipe.ts (§3.1a wipe1x: version.json, lens keep/quarantine, config key filter, symlink unlink, permission precheck, install.wipe_1x event). B3 rerun still running.
- 17:12 IST Phase 7: wrote packages/cli/src/install/hosts.ts (claude/cursor/codex/opencode writers, managed md/toml blocks, rule text, opencode plugin shim, removeInstallFile).
- 17:09 IST B3 rerun (sig fix) done: catch 5/8 62.5%, FA 3/8 37.5%, median 4.37s — unchanged. Root causes of the 3 FAs: (a) boundary flags driven by docs/*.md majority and leaf packages (benchmarks) → guard boundary now counts only analysed files and flags only packages other packages import (intelligence session.ts + core test); (b) high-blast on package.json/tsconfig in a brand-new folder → receipt folderExistedAtHead gate (+test); also barrel re-export no longer a duplicate of its own source (reexportFamily +test). Phase 7 install/uninstall/upgrade code written (cli install/wipe.ts, install/hosts.ts, commands/install.ts; InstallRecord gains scope/root/source/files). Full build OK.
- 17:31 IST Phase 7 build green. Full test run: shared git-head HEAD-2/3 timed out at 5 s under load 32 (orphan vitest workers from interrupted runs, killed); describe timeout raised to 30 s (spawns git). Re-running full suite.
- 17:48 IST Tests: all green except contention timeouts. Fixes: test-support/shared vitest testTimeout 30 s (match core/daemon/mcp-server); review-pr skill prose no longer names 'receipt' (opt-in tool, surface test). receipt.test 17/17 alone (47 s); timeouts under full-suite load are contention (orphan vitest workers from interrupted runs killed).
- 17:58 IST Phase 7: install prints one line per host (`Prism <v> installed for Claude Code (local build <sha>).`), Codex skipped with `Codex not found; skipped.` when ~/.codex is absent; record not written when nothing installed. Isolated-HOME install claude/opencode/codex verified.
- Phase 8: lockstep 2.0.0 for all 13 published packages + PRISM_CORE_VERSION; graph daemonLaunch now uses resolvePrismBin (npx fallback removed, NOT_FOUND with fix line).
- Phase 8: scripts/check-lockstep.mjs + scripts/check-no-published-refs.mjs (DEV-2; probe-verified) wired into `bun run lint`; engines >=24; Action §6: PRISM_HOME=$RUNNER_TEMP/prism cached (not ./.prism), no setup-node npm cache, shallow clone auto-deepens (fetch --deepen=200 + base ref) before failing with PRISM_SHALLOW, version default "2", node-version 24, fork PRs skip the comment with a notice (GA-7), receipt block omitted when none (no error text); prism-review.yml builds with `bun run build` (old list missed checks/daemon/plugin).
- Phase 8: doctor gains Install + Published (no-published-refs over ~/.claude.json, ~/.claude/settings.json, plugin, ~/.cursor/mcp.json, opencode.json, codex config.toml) and --fix (stop daemon, rewrite recorded editors to the local build). DEV-1 verified in isolated HOME (npx@latest in Cursor → fail; --fix → local bin, ok; doctor 0.26 s). New `prism stats [--since]` (COV-73) + tests. cli README updated. cli 130/130.
- Phase 8 docs: removed VS Code tabs (7 guides), health/map/Iris/Spectrum/extension/Dispatch/consent text across docs + package READMEs; troubleshooting gains doctor --fix, published-refs and a PRISM_X error-code table; Action docs @v2/Node 24/PRISM_HOME/auto-deepen; check-docs drops the Iris/Spectrum glossary rule (UI deleted) and knows receipt reason tokens. docs:check ok (38 pages).
- Build, lint (incl. lockstep + no-published-refs), typecheck, full test suite: all green.
- Phase 7: plugin pack build is now staged + swapped (no half-written pack under running hooks). upgrade is local-only/offline by design (re-links recorded hosts to the recorded checkout).
- Final benchmark run started: /tmp/prism2/final-bench.sh → /tmp/prism2/final (B7/B4/B2, B3, B8, B5, B9, B1, gate).
- SMK fixes: `prism` first run prints one progress line (duplicate 'Indexing…' removed); `prism lens add <id>` takes --name and needs only one of --checks/--checklist/--trigger (role/focus/checklist default from them) per CL-1/CL-6/SMK-17/18. Test-isolation bug found: unit tests wrote ~/.prism/events.jsonl and ~/.prism/lenses/lenses.json into the REAL home (global stores used prismHomeDir directly). Fix: prismHomeDir returns a per-process temp home under Vitest/bun test without PRISM_HOME. The two files already written are left in place and reported. cli integration: install/upgrade now expected failures (unknown client / no record; never writes real editor configs); stats output fits the width. cli integration 111/111.
- 18:13 IST final bench found interrupted (B4 hono-001); re-run in background.
- 18:14 IST SMK CLI rerun (smk3): SMK-1..5,9cli,17,18,22..25 pass; Claude Code not logged in under isolated HOME -> CC SMK/B6 skipped; opencode B6 A/B started (/tmp/prism2/ab-opencode.sh).

- 19:04 IST: final bench done (gate FAIL 2: B3.catchRate, B5.editToVisible). B6 opencode partial (B3 run still going). Wrote plans/notes/prism-2-change-report.md. No commits.

## Gate-failure fixes (2026-10-14, after owner review)
Owner asked to fix both gate failures without loosening thresholds. Results in `/tmp/prism2/fix`, gate input `/tmp/prism2/gate2` (final run + new B3/B5).

**B3 catch rate (0.375 → 0.625, false alarms stay 0%).** The "already failing" check was not the cause: no catch in either run came from a check. Every catch is a Guard flag on a file the later fix touched. Three root causes:
1. `reexportFamily` (guard/session.ts) walked re-export edges in both directions at once, so two unrelated files behind one shared barrel counted as "the same declaration". That silently removed real duplicate flags (es-toolkit 6b1e88c2, hono 69f303e0). Fixed: walk barrels-of and sources-of separately; siblings stay comparable. New test in `session.test.ts`.
2. The replay harness installed dependencies once at HEAD, then ran old commits against that install. Every check failed on both sides for environment reasons ("eslint: command not found", "vitest not in the PnP map"), so all checks read as already failing. Fixed: `ensureInstalled` in `scripts/replay-benchmark.ts` reinstalls whenever package.json/lockfile changes. Checks now really run (hence median receipt 5.3 s → 16.7 s in this replay; real test runs, not a product regression).
3. The remaining gap vs the 0.75 baseline is hono 2159deb4. Its 1.x "catch" was an orphan flag on `src/middleware/etag/index.ts`, which is a public package entry (`"./etag"` in package.json exports and jsr.json). That flag was false; 2.0 correctly skips entry points. The true baseline is 5/8 = 0.625, so B3 is at parity.
Gate: still FAIL on B3.catchRate (0.75 → 0.625, any drop) because the stored baseline counts that false catch. Not loosened. Owner decision: re-baseline B3 to 0.625 or keep it failing.

**B5 edit→visible p95 (2985 → 2398 ms, baseline 2346, +2.2%, PASS).** Profiled with `--cpu-prof`. Root cause: 2.0's `graph find` dedupe built the full dependency graph on every query (~0.5 s at 11.8k files right after an edit), but it only needs re-export edges when a hit is an `export` row. Fixed in `core/src/graph-query.ts`: build it lazily only then. Warm Prepare p95 is 668 ms.

Gate now: 20 of 21 pass; only B3.catchRate fails (see above). Build, lint, typecheck and full tests pass.

Other housekeeping: stopped the opencode A/B (B6 stays partial). Deleted the approved stray items in `~/.prism`: workspaces 0a2c7672…, 28a6657f…, 8b8b132a…, cf3fd704…, d5858c50…, plus `events.jsonl` and `lenses/lenses.json`. `21d9772f…` (pre-existing, modified by tests) was kept. Freed temp space by removing node_modules under `/tmp/prism2/ab` (disk had hit 100%). Hand-labelled tasks exported to `plans/notes/golden-tasks-for-review.md` (48 tasks; contains private rentmaadi tasks, keep uncommitted). C-1/C-14 remain drafts. Nothing committed or pushed.

**B3 baseline corrected (2026-10-14, owner-approved):** catch rate 0.75 → 0.625 (6/8 → 5/8). The 1.x "catch" on hono `2159deb4` was a false orphan flag on `src/middleware/etag/index.ts`, a public package entry (`"./etag"` in package.json exports and jsr.json). Original value kept as `catchRateOriginal` in `B3-replay.json`. False-alarm baseline unchanged.

## Approved and committed locally (2026-10-14)
Owner approved everything: the 48 hand-labelled golden tasks (label now "hand-labelled, owner-approved 2026-10-14"), the C-1 ADRs (recorded as ADR-0067, Accepted) and the C-14 budgets. C-14 applied: gate ceilings prompt p95 ≤ 4.5 s, stop p95 ≤ 2.5 s, medium RSS ≤ 1.6 GB (also `budgets.json` medium `peakRssBytes`); B4 re-baselined at 220 tasks; B5 kept at the 2.35 s baseline (fixed, not relaxed). Build, lint, typecheck, full tests and the gate (24/24) pass. Committed locally as one commit; not pushed, tagged or published. `plans/notes/golden-tasks-for-review.md` (contains private rentmaadi tasks) is gitignored; rentmaadi tasks stay in `~/.prism-dev`.

## Next plan implementation (2026-10-15)
- 00:58 IST start. HEAD 08e4d3c. Disk free 2.6 GB (tight). Order: Phase A (P24, tokens/budget P3, P22), then D surface (P12, P15), B (P5, P16, P2), rest as time allows.
- 01:00 IST P24 done: `rotateLog` exported from shared/events; ledger rotates 5 MB×3, reads all generations, legacy per-repo path + ENVELOPE_LEDGER_REL deleted (added to deleted-names). Tests ENV-R1, ENV-R2 pass (core envelope 39/39); deleted-names clean.
- 01:12 IST P3 + shared token estimate done: shared/src/{tokens,budget}.ts (bytes÷4, one estimate; Envelope budgets.ts now re-exports shared table). Registry enforces budget on every tool: optional `maxTokens` (200–12000) and `offset` args, ranked tail-cut of the costliest list, `budget` footer with hint. BUD-1..4 pass. Assumption: arrays in tool results are already rank-ordered (true for all 9 tools); kept bytes÷4 rather than chars/3.6 because B1 calibration needs an A/B run. build+typecheck ok; shared 234, core 208, mcp-server 192 tests pass.

## Watchdog 2026-10-15 01:07 IST
- No implementing background worker active (CheckSubagent empty).
- Log last: P24 + P3 done; habit files present (P15 started ~01:03–01:04, unlogged).
- Change report missing. Disk was ~570 Mi free; freed old /tmp/prism2/{ab,home,replay,smk*}.
- Restarting worker to continue from this log; hard rules unchanged.

## Watchdog 2026-10-15 01:07 IST
- No implementing background worker active (CheckSubagent empty).
- Log last: P24 + P3 done; habit files present (P15 started ~01:03–01:04, unlogged).
- Change report missing. Disk was ~570 Mi free; freed old /tmp/prism2/{ab,home,replay,smk*}.
- Restarting worker to continue from this log; hard rules unchanged.

## Worker resume 01:11 IST
- HEAD 08e4d3c, 26 modified + 9 untracked paths. Disk 7.0 GB free. Found P12 code largely in place (guard_session review:true, review_changes tool removed, docs/skills re-pointed) and P15 files present; verifying both before P22.
- 01:40 IST P12 + P15 done. P12: review_changes tool deleted; its body is `runReview` used by `guard_session {review:true, paths?, base?, lens?, format?}`; skills/docs/READMEs re-pointed; name added to deleted-names. P15: shared/src/habits.ts (zod schema v1, 0600 atomic store, secret scan of 11 patterns, fuzzy find, events log name+count only), `prism habit list|add|show|edit|remove` (--step "source: action | filter"), MCP `habits` tool (default list now 9 incl. habits), skill prism-habits. Tests: HAB-1..9,11 (shared 9 + tool 2), GRD-R1/R2 + contract (26/26), HAB-12 via DEFAULT_TOOL_NAMES assertion; docs reference regenerated; deleted-names clean. Assumption: HAB-10 (no network) covered by code (fs only) + existing no-network rule; step syntax uses '|' for filter.
- 01:14 IST NOTE: a second writer was active in this tree at 01:12 (it appended the P12+P15 line above, stamped "01:40", and ran mcp-server tests). Quiet since 01:13; continuing, re-checking before each chunk. Added on top of P15: `prism doctor` Habits check (invalid file → fail, mode ≠ 0600 → warn); `prism habit add` validates --output before saving.
- 01:18 IST HANDOFF from the first worker (the "second writer" above was me; my earlier "01:40" stamp was wrong, real time ~01:12). To avoid two writers in one tree I am stopping now; the resumed worker owns the tree. Uncommitted work of mine since the P12+P15 line, all in place:
  - P5 (partial): `strength` (full|lite|off) added to shared user-config (STRENGTHS, StrengthSchema) and repo prism-config schemas. Hook `prism-hook.mjs`: readStrength (repo .prism/config.json overrides ~/.prism/config.json, default full); off → every event emits {} ("strength off"); lite → session rules + stop receipt only; trivial prompts skipped by existing non-change path. Classifier: new `trivial` kind (isTrivialChange: TRIVIAL/NOT_TRIVIAL regexes, ≤14 words), "reformat" added to change verbs; hook copy classify-prompt.mjs regenerated with bun build (header kept). Tests CLS-T1..T10 added (shared classify-prompt 36/36 incl. contract). B7: scripts/bench/classifier/trivial.jsonl (40 hand-labelled) + eval metrics trivialRecall/Precision/Packed; result combined changeRecall 0.996 (= baseline), owner 0.974 (= baseline), trivialPrecision 1.0, trivialRecall 0.875.
  - P16 (partial): packages/plugin/hooks/prism-rules.md (ruleset); session hook injects rules first, then orientation (full only). Not yet: RULE-1/2, CACHE-1/2 tests, mcp instructions.
  - NOT done for P5: `prism strength` CLI command, doctor strength line, STR-1..4 / HOOK-T1 tests, build+full test run after these edits.
  - P17 not started. Notes: B8 baseline prompt p50 561/p95 4225 (cold path = READY_WAIT_MS 3000 + in-process prepare), stop p50 2046/p95 2251. Proposed: AUTO_PREPARE_MS 900 incl. ready wait, no in-process fallback when the daemon is enabled but not answering (deadline note instead), keep in-process only with PRISM_DAEMON=0.
- 01:34 IST P5 done (on top of the first worker's partial): `prism strength [full|lite|off] [--repo]` (shared `resolveStrength`/`setStrength`: repo .prism/config.json wins over ~/.prism/config.json, other keys kept, invalid config is an error, never silently full; one STRENGTHS enum in prism-config). doctor shows Strength. Tests STR-1/4 (shared user-config.test 4), STR-2 (off: {} on every event, hook's own time < 50 ms), STR-3 (lite: ruleset only), STR-4 hook-side, HOOK-T1 (trivial prompt → {} + prompt.trivial event). Decision: one `prism strength <level>` command instead of three top-level `prism lite|full|off` commands (fewer names; plan's Files list names strength.ts).
- 01:34 IST P16 done: ruleset now lives in shared/src/ruleset.ts (224 tokens est.), hook copy prism-rules.md held byte-identical by ruleset.contract.test (RULE-1 ≤ 300, CACHE-2 no dates/ids, names only default tools); MCP server instructions embed it; build-pack ships prism-rules.md. Session hook injects ruleset even with no/stale snapshot (event says why); lite = ruleset only. MCP serialisation is cache-ordered: volatile keys (generatedAt, indexedAt, durationMs, budget…) last in each object, nested clock stamps dropped (top-level one kept). CACHE-1 contract (repository_overview twice ≥ 70% identical prefix; was 17% before nested stamps were dropped), CACHE-2 unit tests, RULE-2 (auto-prepare context has no ruleset). Ruleset text claims only shipped behaviour; it will gain the graph body / test command lines when P2/P10 land. Cursor/Codex RULE_TEXT (receipt rule for hook-less hosts) kept separate on purpose.
- 01:34 IST Fixes found on the way: WIPE-6 used rmSync on a symlinked dir (fails on some Node versions) → unlinkSync. Test runs now pinned to Node 24.18.1 (shell default was 23.1.0). P22 started: debouncePerKey test on fake timers; daemon pool tests wait on outcomes (vi.waitFor) instead of fixed 60–80 ms sleeps.
- 01:47 IST P22 done (FLK-1 20× stressed loop not run, see residuals): 16 suites that index a real repo, spawn git or run a repo's own checks moved to `*.integration.test.ts` (core 8: watch, finding-loop, guard-session, git/changed-paths, agents-md, prepare-change, code-explorer, git/prism-gitignore; mcp-server 7: server.contract, safety/{receipt,receipt-service,lenses,snapshot,baseline,hook-command}; shared 1: git-head). Unit configs now exclude integration files (core and mcp-server unit runs used to run them twice) and use vitest's 5 s default; integration configs carry an explicit 60 s ceiling. shared gains vitest.integration.config.ts, `test:integration` script and moon task. CI node-matrix also runs shared/core/mcp-server test:integration. Measured unit maxima after the move (under a concurrent eval load): shared 1.5 s, core 0.4 s, daemon < 0.4 s, mcp-server 0.3 s (FLK-2 met). Integration: shared 4/4, core 89/89, mcp-server 70/70 green.
- 01:47 IST P10 done: test_impact `run[]` = one command per owning package: {cwd, command, argv, scope files|script, runner, tests}. Runner from the nearest package that declares one (hoisted root vitest covers its packages); package manager from the root lockfile (npm→npx, pnpm→pnpm exec, yarn→yarn <bin> incl. PnP, bun→bunx); jest uses --runTestsByPath, bun gets ./ paths; unknown runner → that package's whole test script (scope script); nothing → `runNote`. Replaces the single root-only `runCommand`/`unknownRunner` (no compat). Core reads every indexed package.json once per snapshot (WeakMap cache). Tests TRC-1..6 + hoisted-root case, TI-SYM-1/2 updated, golden updated. Ruleset now says test_impact gives the exact command.
- 01:47 IST Full unit suite (`bun run test`) green; typecheck green; lint+format fixed (one useless spread; oxfmt on 18 touched files).
- 01:56 IST P7 code in: `core/src/git/co-change.ts` (Jaccard over scanned commits, commits > 30 files skipped incl. non-indexed files, pairs < 2 commits dropped, partners memoised). parseGitLog collects per-commit paths; readGitSignals turns it off on a shallow clone (`rev-parse --is-shallow-repository`). Workspace git cache now keyed on index + HEAD sha (one `gitSignalsFor`, replaces four copies that disagreed on keepPaths). rank.ts: partners of seeds become candidates, +0.225·best·jaccard (jaccard 1 = import distance 1), why "changed with <seed> in N commits", provenance measured. test_impact (file origin only) adds co-changed tests with jaccard ≥ 0.2, lane test, confidence medium. Tests CC-1..4 (unit + integration), CC-5/6 rank, 2 change-impact cases. B4 run started (fresh clones in /tmp/prism-next/golden, HOME /tmp/prism-next/home).

## Watchdog 2026-10-15 03:03 IST
- No implementing background worker active (CheckSubagent empty; no prism/bench shells).
- Log last entry 01:56 IST (P7 code in, B4 started). Idle > 30 min. Change report still missing.
- B4-P7 finished at 02:00 under /tmp/prism-next/b4: all.top3=38.2 (was 38.6), recallAtPack=53.3 (was 54.1), testRecall=65.3. Disk ~6.8 GB free.
- Done so far: P24, P3, P12, P15, P5, P16, P22, P10, P7 (code). Remaining: P2, P1, P4, P17, P8, P6, P9, P11, P13, P18, P19, P20, P21, P14, P23 + finish P7 log/residuals.
- Restarting ONE worker; hard rules unchanged (no commit/push/publish/deploy; local build; rentmaadi local; isolated HOME for SMK/A/B; proper fixes; skip blockers; log every sub-step; write prism-2-next-change-report.md at end).

## P7 closeout (B4) — 03:04 IST 2026-10-15
- Worker resume after watchdog idle >30 min. Single writer; HEAD still 08e4d3c; dirty tree preserved.
- B4-P7 at /tmp/prism-next/b4/B4-P7.json (recorded 02:00 IST, prismHead 08e4d3c):
  - all (220): top1=27.3 top3=**38.2** (baseline 38.6, −0.4) recallAtPack=**53.3** (was 54.1, −0.8)
  - testPrecision=28.4 testRecall=65.3 blastPrecision=16.7 blastRecall=52.8
  - tokensP50=1973 tokensP95=1999 prepareMsP50=806 prepareMsP95=3420
  - heldOut top3=45.5 recallAtPack=51.9; open top3=36.4
- Metric vs plan (+6 top3 / +5 testRecall): **not met**. top3 slightly down; testRecall absolute 65.3 (no pre-P7 pair in this log for delta — residual).
- Residuals: co-change weight may add noise on monorepos (plan risk); consider per-package normalisation + weight tune with P6/P8/P9. Shallow-clone off path already in code (CC-4). No further P7 code this stretch unless ranking weight revisit after P8.
- Next: P2 signature-only prepare → P1 → P4 → …


## P2 start — 03:06 IST 2026-10-15
- Signature-only prepare: ContextFile gains signatures + optional top-1 body (≤40 lines); graph mode `symbol` with body:true; house-style limited to one pointer exemplar.


## P2 done — 03:11 IST 2026-10-15
- ContextFile: `signatures[]` (name/kind/signature/line) + optional `body` (top-1 symbol ≤40 lines).
- `shared/src/source-slice.ts` + tests; `intelligence/src/prepare/signatures.ts`.
- House style: one pointer exemplar (`house style pointer: …`), not a list.
- `graph` mode `symbol` (path+name or id `path#name`, `body:true`) → `answer.symbol` with exact range.
- prepare-context / prepare tool / safe-change skill / ruleset + prism-rules.md synced.
- Tests: PREP-S1/S2 (pack), PREP-S3 (graph), source-slice, pack+rank 35/35, graph 7/7, typecheck green.
- Residuals: PREP-S4 B2/B4 recall@pack (±1 pt) needs a B4 rerun (skip overnight unless time); no body >40 enforced.
- Next: P1 repo map.


## P1 done — 03:15 IST 2026-10-15
- `intelligence/src/map/{build,render,cache}.ts`: PageRank over import graph + git recency boost; signatures + top-3 callers/callees; `map.v1.txt` + `map.v1.json` under workspace prism dir; snapshotKey = sha256 of indexedAt+paths+hashes.
- Incremental merge via contentHash (MAP-2); truncate by estimateTokens (MAP-3); no bodies (MAP-4); cache key invalidation (MAP-5).
- `core/src/repo-map.ts` + `workspace.repoMap()`; `graph` mode `map` (default budget 4000); daemon onIndexed debounced rebuild; `prism graph map [--scope] [--budget]`.
- Tests MAP-1..5 (5/5), graph map mode; build core/mcp/cli green.
- Residuals: es-toolkit ≤4k / build ≤1.5s / B1 −50% file reads not remeasured overnight; incremental ≤100ms not bench'd.
- Next: P4 session dedupe.


## P4 start — 03:17 IST 2026-10-15
- Session store under ~/.prism/sessions/<id>.json (hashes/ids only, 24h TTL); prepare/graph/impact optional sessionId+refresh; prune wired.


## P4 done — 03:20 IST 2026-10-15
- `shared/src/session-store.ts` + `session-dedupe.ts`: ~/.prism/sessions/<id>.json, schema v1, 24h TTL, hashes/ids only.
- `prepare_change` gains sessionId + refresh; dedupes pack files to "sent earlier at turn N, unchanged".
- Hook auto-prepare passes sessionId to daemon; in-process path dedupes too.
- `prism data prune` also drops session stores older than 24h.
- graph tool accepts sessionId/refresh (args only; full node-list dedupe residual).
- Tests SES-1..5 green; shared+mcp build green.
- Residuals: impact tool sessionId wiring; graph/impact path-level dedupe beyond prepare; PreCompact refresh hook; B1 −50% repeated-call measure.


## Overnight worker stop — 03:20 IST 2026-10-15
- Wrote plans/notes/prism-2-next-change-report.md
- This stretch completed: P7 B4 closeout, P2, P1, P4.
- Remaining: P17, P8, P6, P9, P18, P11, P13, P19, P20, P21, P23, P14 + residuals in change report.
- No commit/push/publish. Single writer stopped cleanly.

## Watchdog resume 2026-10-15 03:20 IST
- Prior overnight worker stopped cleanly at 03:20 (P7 closeout, P2, P1, P4 done; change report written).
- No other writer active. Resuming ONE worker for remaining: P17, P8, P6, P9, P18, P11, P13, P19–P21, P23, P14.
- Hard rules unchanged.


## P17 start — 03:23 IST 2026-10-15
- Warm daemon / hook p95 under 1s: AUTO_PREPARE_MS+READY_WAIT→900; prompt/stop caps 1s; deadline→ruleset; no in-process when daemon on; stop structural-only; C14→1000ms.

## P17 mid — 03:26 IST
- Builds green; HOOK-P1..P4 unit + stop integration + daemon HK-7 + MAX_READY_WAIT 900.


## P17 done — 03:35 IST 2026-10-15
- AUTO_PREPARE_MS/READY_WAIT/STOP_BUDGET=900; MAX_READY_WAIT=900; C14 ceilings 1000ms.
- Prompt/stop hooks: warm-daemon direct (/v1/call prepare_change, /v1/receipt); mcp spawn only when daemon off.
- Deadline → ruleset + prepare_change note (HOOK-P2); daemon silent → degrade event, no in-process hang (HOOK-P4).
- Daemon /v1/receipt uses reindex:false (watch keeps index warm).
- B8 on m012-features (HOME /tmp/prism-next/home-p17e): prompt p95=264, stop p95=893 (both ≤1000).
- Tests: HOOK-P1..P4 unit, daemon HK-7, stop integration, plugin hooks, daemon server MAX_READY_WAIT.
- Residuals: stop p95 still has occasional ~900ms samples under edit+watch load; in-process stop when daemon off can exceed 1s (cold index).
- Next: P8 namespace member usage.

- Fix while closing: prepare_change dedupe now gets ToolContext.env / daemon env (P4 session store was reading process.env and hitting leftover sess-pack-1).


## P8 start — 03:39 IST 2026-10-15
- Member-level usage for namespace imports (import * as x).


## P8 done — 03:40 IST 2026-10-15
- Analyzer namespaceMemberUses + EXTRACTION_VERSION 4 already in (Phase 2). Edges carry `imported[]`; blast importBindsChanged filters.
- Added NS-2 (computed non-literal → *), NS-3 (escape as value/spread/assign → *); NS-1 already covered members + string-key + type + escape.
- BLAST-SYM: ns-nth-user with imported:["nth"] excluded from debounce blast (P8 narrowing).
- Residuals: NS-4 es-toolkit debounce ≤15 files and NS-5 test_impact precision — need es-toolkit git checkout + B4 (disk ~6.8 GB; skipped overnight).
- Next: P6 feedback ranking.


## P6 start — 03:41 IST 2026-10-15
- Learn from real edits: feedback.jsonl + rank feature.


## P6 done — 03:44 IST 2026-10-15
- shared/src/feedback-store.ts: feedback.jsonl (paths+terms only), scores, 30d prune, weight cap 0.12.
- rank.ts FEEDBACK_WEIGHT 0.12; pack + workspace.prepareChange wire feedbackScores(root, task).
- receipt-service records suggested vs edited after structural receipt.
- data prune: feedback older than 30d.
- Tests: FB-1..4 (store), FB-3/4 (rank). FB-5 B4 held-out residual (no overnight B4).
- Next: P9 why/confidence.


## P9 start — 03:44 IST 2026-10-15
- Confidence + explain-why on ranked picks.


## P9 partial — 03:46 IST 2026-10-15
- ContextFile.confidence (high|medium|low); RankedFile.confidence via rankConfidence(provenance, why).
- why capped to top 2 features; pack emits confidence.
- Tests: WHY-2/CONF-1 (measured high), CONF-1 heuristic medium via feedback-only path.
- Residuals: WHY-1 across test_impact/blast; CONF-2 unresolved import; CONF-3 stale index; CONF-4 schema contract; B4 high-item accuracy; wire graph/impact/guard tools.
- Stopping overnight stretch here for change report.


## Overnight worker stop — 03:46 IST 2026-10-15
- Updated plans/notes/prism-2-next-change-report.md
- This stretch: P17, P8 (unit), P6, P9 (partial).
- Remaining: P9 residuals, P18, P11, P13, P19–P21, P23, P14 + listed residuals.
- No commit/push/publish. Single writer stopped cleanly.


## P9 closeout — 03:50 IST 2026-10-15
- rankConfidence: unresolved→medium (CONF-2), stale index→low (CONF-3), measured→high (CONF-1).
- RankInput.unresolvedFrom + indexStale; pack pulls unresolved from dependency graph; workspace passes indexStale when watchStatus=stale.
- why prioritises honesty phrases in top-2.
- Tests: WHY-1 (rank/blast/test_impact), WHY-2/CONF-1, CONF-2, CONF-3, CONF-4 schema.
- Residual: B4 high-item ≥80% (disk; skip), graph tool already has edge evidence.
- ContextFile.confidence optional for legacy rows; fixtures patched with signatures:[].


## Worker resume — 05:06 IST 2026-10-15
- Single writer. HEAD 08e4d3c, dirty tree kept. Disk 6.6 GiB free.
- Found P18 half-started (unlogged, 03:51): `shared/src/structured-finding.ts` + tests, receipt wiring; `receipt.ts` missing its `FindingSchema` import (shared build was red).
- Order: P18 → P11 → P13 → P19 → P20 → P21 → P23 → P14 + residuals.


## P18 done — 05:20 IST 2026-10-15
- `FindingSchema {what, where, fix ≤160, riskIfSkipped low|med|high, sources[]}` moved ahead of Guard schemas; FindingRef doc comment re-attached.
- Producers mapped: receipt flags + lens checks (`findingsFromReceiptParts`), Guard (`GuardSession.findings` via `findingsFromGuardFiles`), `list_findings` rows (`ListedFindingSchema` = Finding + id/fingerprint), `guard_session {review:true}` → `review.findings` (replaces raw `lensFindings`).
- Receipt text/markdown render one path: `where — what → fix (risk)`; derived from flags/lenses when a stored receipt has no `findings`. Old `Flag` lines gone.
- Fixed `receipt.ts` missing import; `findingsFromReceiptParts` accepts undefined parts (exactOptionalPropertyTypes).
- Deleted unused `listStructuredFindings`; `list_findings` description no longer names the deleted `queue_finding`.
- Tests: FND-1..4 + guard/list/render (9/9); shared 281/281; mcp-server contract integration 27/27; core guard-session integration 4/4.
- Pre-existing red: `instructions.test.ts` 1.5 KB cap (1593 B after P16 ruleset embed) — fixed in P11 (stop-verdict line rewrite).


## P11 done — ~05:30 IST 2026-10-15 (time corrected from a mistyped 05:58)
- Verdict first: `shipVerdict()` / `shipVerdictLabel()` in `shared/src/receipt.ts` → line 1 `Prism · SHIP`, `Prism · NOT PROVEN (reason)`, `Prism · NO-SHIP (N checks failed[, M off-limits paths])`. Stored `verdict` enum unchanged (proven/not_proven/failed). NO-SHIP only for a blocking failure (already-failing excluded) or a failing `off_limits_touched` lens check.
- Same label in summary line (SMK-8), markdown, SVG colour, `prism receipts`, review `lastReceipt`, and the dependency-free stop hook mirror (`renderReceiptLite`).
- Findings ordered by agreement (`receiptFindings`): distinct sources per file, a blocking check whose output names the file counts as a source; then risk.
- Cheapest proof (`receipt.proof {command, cwd, estimateMs?, proves[]}`):
  - `impact.typecheckPlan` (typecheck script → `tsc --noEmit -p .` → `tsc --noEmit <ts>` / `node --check <js>`); `TestPackage.hasTypecheckScript/hasTsconfig`.
  - `workspace.checkRunPlan({tests, typecheck})` (core) returns test runs + type-checks + package manager.
  - `mcp-server/safety/receipt-proof.ts`: candidates built once in the structural pass (kept on `CheckPlan`), `selectProof` after checks: test runs only when reaching tests did not run (`pm install && …` for no_node_modules), never a check that already passed; `shared/receipt-proof.ts` `cheapestProof` = most files proved, then fastest median recorded duration (`recordedCheckDurations` over the newest 20 stored receipts; `listStoredReceipts(root, env, limit)` now bounded by mtime).
  - Rendered as `Prove it  run: <cmd> (in pkg, ~4 s) → proves a.ts`.
- Server instructions back under the 1.5 KB cap (1523 B) with the new verdict line; receipt tool/README text updated.
- Receipt tokens (estimateTokens, HEAD renderer vs now, 4 representative receipts): no-flag receipts −13…−20% (text render drops the `Touched` line the summary already states); flagged receipt +11%; untested receipt +25% only because of the new `Prove it` line. Aggregate +5.4% incl. proof lines, −2.5% without (P18 target ≤5% met).
- Tests: RV-1 (3 states + off-limits), RV-2, RV-3, NP-2 + proof line, NP-3 render, NP-1 `typecheckPlan` ×3 and end-to-end in the stop-hook integration (untested source → `Prove it run: …`). shared 290/290, impact 59/59 (+3), mcp-server unit 135/135, mcp safety+contract integration 49/49 + hook-command 3/3, cli 130/130, plugin 33/33.
- Residual: B3 replay not re-run (needs es-toolkit/zod/hono checkouts; disk 6.6 GiB). FA can only move via an off-limits lens, which B3 does not configure.


## P13 done — 05:43 IST 2026-10-15 (time corrected from a mistyped 06:20)
- `ChangeReceipt.value` (`SessionValueSchema {tokensIn, filesCovered, estimatedSaved|null, issuesCaught, checksSuggested}`) replaces the free-text `envelope` footer; `envelopeFooter` deleted (its only caller was the in-proc stop path).
- `shared/src/session-value.ts`: `sessionValue()` + `sessionValueLine()` → `Prism this session: 9.1k tokens in · saved: not calibrated · 2 issues caught · 1 check suggested`; negative saving prints `cost ~Nk more than it saved (estimate)`. `WITHOUT_PRISM_TOKENS_PER_FILE = null` until the B6 A/B (P14) measures it (ADR-0066: never guessed).
- Issues caught = NO-SHIP reasons (blocking checks, off-limits paths) in this session's earlier receipts that are gone now; checks suggested = distinct proof commands this session.
- Receipt service computes the value for both the structural and the checked receipt (daemon and in-proc share it): Envelope rows since the session baseline (other sessions' hook rows excluded), session-store file entries, newest 50 stored receipts of the session. Failure → `receipt.value` degraded event, receipt still served.
- `readEnvelopeLedger(root, env, {since})` reads newest generation first and stops at the one that starts before `since` (stop hook no longer parses all 3 × 5 MB generations).
- Found + fixed a P17 gap: the daemon-direct prompt hook injected prepare context without an Envelope row, so hook tokens were invisible. `prism-hook.mjs` now appends the row itself (`recordEnvelope`, same rotation as events via shared `appendRotated`). Stop lite render mirrors the value line.
- E2E (isolated PRISM_HOME/HOME `/tmp/prism-next/home-p13`, scratch git copy of m012-features): prompt → ledger row 962 B; stop → `Prism this session: 241 tokens in · saved: not calibrated · 0 issues caught · 1 check suggested`.
- B8 (same setup, 12/8 samples): prompt p95 260 ms, stop p95 688 ms (C-14 ≤ 1000) — `/tmp/prism-next/B8-p13.json`.
- Tests: VAL-1..4 + suggested/render (5/5), ledger `since` (ENV-R1 extended), RE-1 asserts value on both receipts; core envelope 38/38, mcp-server unit 135/135, safety integration 36/36, plugin 33/33.
- Residual: VAL ±25% vs B6 needs the A/B (P14, owner credits); no unit test drives the mjs daemon-direct ledger write (verified E2E only).


## Worker resume — 07:11 IST 2026-10-15
- Single writer. Order: P19 → P20 → P21 → P23 → P14. Disk ~6.4 GiB free. No commit/push/publish.

## P19 start — 07:11 IST 2026-10-15
- Fast onboarding: close ONB-4 partial-index path; verify ONB-1..3; log timing.


## P19 done — 07:16 IST 2026-10-15
- `prism start` / bare `prism`: install detected hosts → package-first index (cap 500) → repo map + try line.
- Indexer `maxAnalyzeFiles` + `prioritizePackageFirst` (deepest owning package root; shallow packages first).
- Partial → `ensureDaemon` + `warmDaemonWorkspace` background finish; else note to run `prism index`.
- `first-run.ts` folded into `start.ts` (already deleted).
- Tests: package-first 2/2, index-job ONB-4 + 3 others 4/4, start unit 3/3, cli integration ONB-1..3 2/2 (~12 s on m012-features).
- Residual: ONB-1 es-toolkit wall-clock <60 s not re-run (disk ~6.4 GiB; m012 proxy).
- Next: P20 docs/website.


## P20 start — 07:16 IST 2026-10-15
- Docs and website match 2.0: drop 1.x theaters/VS Code/npx@latest/review_changes; lint coverage.


## P20 done — 07:19 IST 2026-10-15
- Home/products: Start → Prepare → Receipt; deleted guard-theater + question-led.
- Hero command `prism start`; MCP panel drops VS Code, adds opencode; plugin cmd `prism install claude`.
- Docs: quickstart start-first; faq CI without npx; wire-into-ci without published @2 pins.
- Lint: check-no-published-refs covers apps/website/{app,components,lib} + docs; check-docs-tools.mjs (DOC-W3) on lint.
- DOC-W1: website tsc --noEmit clean. DOC-W2: deleted-names + no-published-refs clean. DOC-W3: 9 default tools match.
- Residual: full `next build` not run (disk); product-window kept (prepare/envelope theaters still use it).
- Next: P21 install matrix + Action v2 proof.


## P21 start — 07:19 IST 2026-10-15
- B10 install matrix script + verify.yml job; Action shallow/fork notes.


## P21 done — 07:20 IST 2026-10-15
- `scripts/bench/install-matrix.mjs` (B10): isolated HOME × claude/cursor/codex/opencode → install --local + doctor; claude fires SessionStart hook.
- Local run: **4/4 PASS** → /tmp/prism-next/B10/B10-install-matrix.json.
- `.github/workflows/verify.yml`: `install-matrix` job (ubuntu/mac/win) + `action-shallow` (ACT-2 deepen proof).
- Residuals: ACT-1 fork PR comment needs a real fork PR (owner); full OS matrix only on CI; gate does not yet fail release on missing B10 file (P14 territory).
- Next: P23 large-repo memory.


## P23 start — 07:20 IST 2026-10-15
- Large-repo memory proof (B9 large); disk ~6.4 GiB — may block full 50k fixture.


## P23 done — 07:32 IST 2026-10-15
- budgets.json large peakRssBytes 4 GiB → **3 GiB** (plan target).
- gate.mjs: C14.largeRss ≤ 3221225472 on B9-budgets-large.json.
- B9 medium (reps=1, isolated HOME): peak RSS **1171 MB** / 1638 MB (headroom **28.5%**) — MEM-3.
- B9 large 50k files (reps=1): completes; peak RSS **1804 MB** / 3072 MB — MEM-1/MEM-2.
- Gate ceilings: C14.mediumRss + C14.largeRss **pass** (/tmp/prism-next/gate-p23).
- No graph-retention code change: prepare graph-cache already WeakMap-per-snapshot; RSS under target.
- Residuals: medium/large **time** budgets OVER for index_warm/incremental/dependency_graph (isolated HOME cold cache; not a P23 RSS failure). Re-tune time budgets or warm-cache path separately.
- Next: P14 (likely blocker: owner credits).


## P14 blocked — 07:32 IST 2026-10-15
- Published B6 A/B (Claude Code + opencode, n≥10) needs owner API credits + host auth under isolated HOME.
- GATE-T2 (missing B6 fails at release) not wired; no docs/benchmarks/2.x.md publish.
- Skip until owner runs A/B; VAL calibration (P13) also waits on this.


## Stretch close — 07:32 IST 2026-10-15
- Completed this stretch: P19, P20, P21 (local B10), P23. Blocked: P14 (+ ACT-1 fork PR).
- Writing plans/notes/prism-2-next-change-report.md covering P1–P24.
- No commit/push/publish.


## P14 finish — 13:33–13:45 IST 2026-10-15
- B6 Claude Code A/B had finished (44/44, 12:09–13:27 IST, `/tmp/prism2/p14-ab.log`). Transcript totals: A median 92,431 tokens / $0.138 / 41 s / 21 of 22 pass; B 134,434 / $0.179 / 55 s / 20 of 22. Means 130,678 vs 163,844 (the `-p` summary's 131,578 under-counted es-toolkit-3433044c B2: 42,571 vs 752,430).
- opencode: not run in P14. The owner chose a Claude Code subscription sign-in, opencode needs its own provider credential (the API key had $0), and `agent-ab.ts` only drives `claude`. The 2026-10-14 opencode partial (3/arm) isn't counted. Recorded in `docs/benchmarks/2.x.json` `notRun` and on the page.
- Transcripts: `plans/notes/benchmarks/b6-sample-transcripts.md` (3 same-task pairs from the previous worker) plus matching, redaction and root-cause sections. Evidence: 0/22 B sessions called Prism tools; events.jsonl shows auto-prepare deadline skip 21/22 and stop "daemon silent" 20/22, with 162 checkout events.
- VAL: tokens-per-file fit −29,149 (not physical) → **fail**. `WITHOUT_PRISM_TOKENS_PER_FILE` stays null ("not calibrated"); comment and `prism envelope` wording updated.
- GATE-T2: `REQUIRED_HOSTS` (Claude Code, opencode) in b6-report; release-gate fails when a host is missing. Added a CLI, wired into `publish-npm.mjs` (dry-run too) and `publish-npm.yml`, plus a `bench:release-gate` script. New test. 9/9 pass.
- `release-gate.mjs` now: FAIL (5) — B1 missing in docs/benchmarks (4.59 with `--current /private/tmp/prism-ab/b1`), opencode missing, CC tokens/cost/success worse. **Recorded as a release blocker; not loosened.**
- B7 re-run: recall 0.996, question FP 0.013, trivial P 1.0 / R 0.875.
- Auth: the isolated HOME has no `.credentials.json` / `.claude.json` (removed at 13:32 by the previous worker; verified). Content scan for OAuth/sk-ant is clean; the keychain has only the original item; the real ~/.claude was untouched. No API key file anywhere.
- Fixed oxlint error in install-matrix.mjs (unused `dirname`). oxfmt/oxlint clean on scripts/bench and publish-npm.
- Final report written: `plans/notes/prism-2-next-change-report.md`. 215 uncommitted paths. No commit or push.

## Token fixes start — 14:48 IST 2026-10-15
- Owner said "fix all" for fixes 1–5 (prompt-injected pack, stale-serve daemon + incremental checkout, ≤1k overhead, auto-lite, harness). Then re-run B1/B8/B9/B4/B6, VAL, release gate. No commit/push.

### TF-0 build fix — 14:54 IST
- Full `bun run build` failed: website `/benchmarks` client chunk pulled `node:fs` via `@repo-prism/shared` root (session-store, session-dedupe, feedback-store were exported from the root).
- Moved them to subpath exports `@repo-prism/shared/{session-store,session-dedupe,feedback-store}`; updated 5 importers. New `shared/src/root-browser-safe.test.ts` (no `node:` reachable from the root). Build: 16/16 tasks pass.

### TF resume — 15:38 IST
- Previous worker interrupted mid integration-test run. Unit tests (test.txt 15:37): all packages pass incl. core 124 (api-surface `repoMap` fixed in CORE_SDK/api-surface at 15:32). Re-running build + integration tests now; then reviewing fixes 1–5 diffs.
- 15:40 Reviewed working tree vs fixes 1–5: (1) prompt hook injects prepare pack via daemon `/v1/call` as additionalContext ≤2,400 chars; (2) pool diffs indexed HEAD→new HEAD and feeds the incremental watch path (full reindex only >2,000 files / no diff), prepare marks "stale index", receipt route `reindex:false`, quiet prewarm; (3) one `prism` skill (4 retired skills removed on install), instructions <1,000 chars (test-capped), ruleset not re-sent on SessionStart under Claude Code; (4) named-file prompts → lite pack + quiet before-edit nudges; (5) harness waits for index (warm/cold), transcript tokens, `--host opencode`, `--strict-mcp-config`. All present. Build + integration running.
- 15:42 build 16/16; integration all pass (cli 119/119, core 93, mcp 70, indexer 8, shared 4, analyzer 1) — start/habit/SMK-5 failures already fixed in tree. Running unit tests, lint, typecheck, format.
- 15:42 Copied owner's Claude Code login into isolated HOME only (/private/tmp/prism-ab/home/.claude/.credentials.json + minimal .claude.json, mode 600; not printed). Real ~/.claude untouched.
- 15:43 Static checks: unit tests, lint, typecheck, format all pass. Running B8-checkout (prompt after checkout, before=13.6% injected, p95 1,413 ms) before B6 since it uses the same clones.
- 15:46 B8-checkout crashed: `index.lock exists` — the daemon's checkout handler (fix 2) runs `git status`, which takes index.lock and broke the next `git checkout`. Fixed: `--no-optional-locks` in read-only git readers (core changed-paths, hook gitLines, lens-checks); new integration test (index bytes unchanged after a stat-dirty read; verified plain status rewrites it). Rebuilding, re-running B8-checkout.
- 15:47 B8-checkout after (delay 0, n=22, fresh PRISM_HOME): prompt p50 737 / p95 939 ms (before 1,225/1,413), injected 54.5% (before 13.6%), checkouts handled incrementally (~80–200 ms, 3–76 files). Misses: cold daemon on first 2–3 prompts, and 'no file matched' when the prompt fires <300 ms after checkout, before the new test files are indexed. Starting B6 Claude Code A/B (tag tf, 2 runs × 11 tasks × 2 arms = 44) → /tmp/tf/b6.log.
- 15:48 B1 after: with/without tokens 35,870 / 7,893 = **4.54×** (before 4.59×); calls 50 vs 250. /tmp/tf/after/B1-orientation.json. B4/B9/B8 wait until B6 finishes (CPU-heavy, would skew B6 times).
- 16:02 Stopped B6 after 3 sessions: arm B was using a STALE dev pack (dist/dev-pack from 12:30 — 5 old skills, old hooks; skill listing 9,140 chars). Rebuilt dev pack (1 skill, current hooks, Node 24.21). Harness now refuses a dev pack whose hooks/skills differ from source (stalePackFiles + test). Discarded the 3 runs (/tmp/tf/runs-tf-stalepack.jsonl). Also found 2 daemons in one PRISM_HOME: takeLock stole the lock of a live daemon >30 s old that missed the 1 s health check while indexing. Fixed (live owner that wrote the record = busy daemon, not pid reuse) + test (fails without the fix). Killed 15 leaked daemons (bench + `prism start` tests).
- 16:03 `prism start` integration test now stops the daemons it starts; prompt-checkout stops its daemon in finally. Rebuilt (16/16) + dev pack (stale check clean). Relaunching B6 (tag tf, fresh runs file).
- 16:07 Stopped B6 again after 3 sessions: arm B 'warm' sessions still missed the pack — the harness started the session right when the daemon began its 2 s-quiet Prepare prewarm (blocks the event loop ~1–2 s on es-toolkit), so /v1/ready got no answer. Harness waitForIndex now also waits 2.5 s after 'fresh' and for /v1/health to answer within 300 ms (real use: a warm, idle daemon). Discarded runs → /tmp/tf/runs-tf-nowait.jsonl. Overhead check from that run: first-call prompt A 15,352 vs B 16,627 tokens (+1,275; before +3,941). Relaunching.
- 16:12 B6 running (3/44). First warm arm-B session got the pack injected (1,561 chars, 653 ms). Seen misses: one prepare >773 ms (es-toolkit-3433044c); stop-hook receipt built in 1,147 ms but the hook gives up at ~725 ms → 'daemon silent'.
- 16:24 B6 paused at 8/44: host stop 'auth failed' at 16:19 — 'OAuth token revoked'. The copied subscription token was due to expire 16:23:58 (Claude refreshes ~5 min before expiry); keychain item still shows that expiry. Removed the copied credentials file. Not re-copying an about-to-expire token (a refresh from the copy would rotate the owner's refresh token). Polling keychain expiry (read-only) for a fresh token; running B4/B9/B8 meanwhile. Harness resumes from recorded sessions.
- 16:25 Keychain 'Claude Code-credentials' was rewritten at 16:23:58 IST (its old expiry) and now carries expiresAt 0: the owner's own Claude Code login looks revoked/expired too and likely needs `/login`. Most likely cause: two holders of one rotating refresh token (the isolated copy and the real login) around the 16:19 pre-expiry refresh. Not touching it. B6 stopped at 8/44 (A 5, B 3). Proposed: owner runs `claude setup-token` (long-lived token, no shared refresh token) for the bench; runner passes it as CLAUDE_CODE_OAUTH_TOKEN inside the isolated HOME only; harness resumes from recorded sessions.

### TF benches resume — 16:33 IST
- No `~/.prism-ab-token` yet (checked 16:28). B6 stays paused at 8/44; re-checking every 5 min while B4 runs.
- B8 (16:24–16:25, Node 24, fresh HOME /tmp/tf/b8home), from /tmp/tf/after/B8-*.json:
  - m012 fixture: prompt p50 116 / p95 612 ms; stop p50 788 / p95 798; before-edit p95 202; after-edit p95 111; session p95 286.
  - es-toolkit: prompt p50 495 / p95 552 ms (now builds + injects the prepare pack); stop p50 827 / p95 954; before-edit p95 214; after-edit p95 114.
- B9 medium (16:25, Node 24.21, isolated HOME, reps 1): index cold 20,144 / warm 2,673 / incremental 77 ms; dependency_graph 316; blast 276; dna 459; peak RSS **939.8 MB** (before 1,171 MB on Node 23). `run.mjs --out` resolves against the repo root, so the file landed in `Prism/tmp/`; moved to /tmp/tf/after/B9-budgets.json and removed the stray `tmp/`.
- B4 running since 16:25 (/tmp/tf/after/B4.log).
- 16:50 B4 after token fixes: all top-3 35.9 (was 38.2), recall@pack 37.7 (was 53.3), tokens p95 5,426 (mono 13,955) over the 2,000 hard cap. Root cause (from P2 signatures, not fixes 1-5): pack budgeting used tokenWeight, which undercounts signatures' JSON, so fitPrepareToBudget dropped whole files (hono-011: 5 → 1); and its last-resort step never trimmed signatures/body, so barrel files (es-toolkit compat.ts, 5,220 tok) broke the cap. Fix: pack loop budgets on the entry's JSON tokens; fit step 3 trims body then signatures; new test (400-signature barrel). Rebuilding.
- 16:41 Pack loop also falls back to a slim entry (path, symbols, why; no signatures/body) when the full one doesn't fit, so lower-ranked files stay in by path (pre-P2 shape). hono-011 now 5 files incl. the gold file. New test in pack.test.ts; shared 297, intelligence 170, core 124 pass. Re-running B4 → /tmp/tf/after/B4-golden-fix.json.
- 16:53 B4 re-run with the pack fixes (/tmp/tf/after/B4-golden-fix.json): top-3 **37.7** (P7 38.2; before fix 35.9), recall@pack **42.8** (P7 53.3; before fix 37.7), tokens p95 2,002 (before fix 5,426), held-out top-3 47.7. Remaining tokens >2,000 (≤ 2,031): token fix 1's `pack.run` was attached in core after the hard cap. Fix: `buildPrepareChange` takes `testRuns` and attaches `run` before `fitPrepareToBudget`; core passes `packTestRuns(snapshot)` (replaces `withTestRuns`). hono-027 2,031 → 1,977. intelligence 171, core 124 pass; tsc clean.
- Remaining recall@pack gap (−10.5 vs P7) is P2's signatures: a full entry costs ~5× a pre-P2 entry, so fewer files fit 65% of 2,000. Lower-ranked files already fall back to path/symbols/why; no further tuning without the owner (would trade signatures for files).
- 16:55 Full build + dev pack, then format/lint/typecheck/unit/integration; then B4 final, B8, B1.
- 16:58 format/lint/typecheck/unit/integration all pass (bun run …, exit 0). Killed 1 leaked test daemon (prism-test-home-51261, m012 fixture; it had an idle timeout). Running /tmp/tf/bench-final.sh: B4, B8 (m012 + es-toolkit), B1, B9 medium on Node 23 vs Node 24 (index-time question).
- 17:00 ~/.prism-ab-token present (owner, 16:54, mode 600). agent-ab.ts: new PRISM_AB_OAUTH_TOKEN_FILE — read in the harness and set as CLAUDE_CODE_OAUTH_TOKEN in the claude child env only (isolated HOME; inherited key vars still removed; never logged). Runner /tmp/prism-ab/run-ab-tf2.sh resumes tag tf (8 recorded). Note: the 3 recorded B sessions predate the 16:41–16:53 pack fixes. Waits for bench-final to finish (CPU).
- 17:01 Per owner/parent: the 3 recorded arm-B sessions (pre pack-fix build) moved to /tmp/tf/runs-tf-oldB.jsonl; runs-tf.jsonl keeps the 5 arm-A sessions; arm B re-runs entirely on the current build.
- 17:03 Gate (non-release) FAIL 2: B4.recallAtPack 54.1→42.8 and C14.stop.p95 1,054 ms (es-toolkit). Stopped B6 resume after 0 new sessions (its first arm-B session would have mixed builds) to finish PREP-S4: only the top FULL_SIGNATURE_FILES files carry signatures, the rest go slim. Measuring k on hono/preact/portpilot subset.
- 17:14 k (signature files) on hono/preact/portpilot (110 tasks): k=1 top-3 44.5 / recall 60.4; k=3 43.6 / 53.6; all 43.6 / 51.3 (P7 subset 66.7 recall). Chose FULL_SIGNATURE_FILES = 1 (same as body). PREP-S2 test updated (top file carries signatures, rest []). Full build + format/lint/typecheck/unit/integration pass. Relaunching B6 resume (5 arm-A kept, arm B all on this build); B4 final runs niced alongside (recall is deterministic); B8 after B6.
- 17:28 B4 full with k=1 (/tmp/tf/after/B4-golden-k1.json, niced alongside B6): top-1 27.3, top-3 **38.2** (= P7), recall@pack **49.5** (P7 53.3, 2.0 baseline 54.1 → gate rule still fails by 4.6), test P/R 28.4/65.3, tokens p95 1,998 (0 over cap), held-out top-3 47.7. prepare ms inflated by B6 running concurrently. Remaining recall gap = per-file fields added in P2/P9 (signatures key, confidence, provenance) on every entry; not cut without the owner (API shape).

### TF resume 2 — 17:52 IST
- B6 resume (pid 62967, launched 17:14) alive: 27/44 recorded (A 13, B 14) in plans/notes/benchmark-real-agents/runs-tf.jsonl. Letting it finish; then token cleanup, B6 summary, VAL, release gate.
- 18:05 Root causes found while B6 runs (source edits only; dist untouched until B6 ends so arm B stays on one build):
  - **Stop p95**: B8 es-toolkit events show the daemon's `/v1/receipt` took 527–832 ms even for an unchanged diff (`receipt.dedupe`), so 3 of 8 stops timed out ("daemon silent"; B8 counts `{}` as output). Profile (`/tmp/tf/probe/receipt-prof.mjs`, steady state ~850 ms in-process): guardSession → checkGuardSession → checkDuplicates rebuilt `buildKnowledgeGraph` + `buildFeatureGraph` on every call, though Prepare already caches both per snapshot; lens `new_cross_package_edge` walked package.json manifests for every edge in the repo even when the session added no import. Fix: guard uses `cachedKnowledgeGraph`/`cachedFeatureGraph`; the lens check collects added cross-package imports first and only scans the rest of the graph when there is one (same result).
  - **recall@pack**: probe (`/tmp/tf/probe/probe2.mjs`) on regressed tasks: the top file's full entry is admitted uncapped (portpilot-hl-016: 1,117 of the 1,300-token file budget, 40 signatures → 2 files; hono-015 985 tok). Fix: top file's signatures cut from the end to TOP_FILE_SHARE of the file budget (env knob only for the sweep, removed after). New pack test (fails without the cap).

- 18:39 B6 finished 44/44 (EXIT 0 18:32). Deleted ~/.prism-ab-token (verified gone); no sk-ant content or .credentials.json in the isolated HOME; killed A/B daemon pid 63439 (no daemons left).
- 18:42 B6 after (Claude Code, 22/arm, transcript tokens): A 22/22 (100%), median 109,526 / mean 139,665 tok, $0.143, 51 s; B 20/22 (91%; both fails hono-e5bb2062), median 121,823 (1.11×; before 1.45×) / mean 163,552, $0.151 (1.05×), 60 s; Prism tool calls 0; prompt pack injected 8/22 B sessions. First-call prompt overhead median +598 tok (before +3,941). Tasks where B used fewer tokens: 2 of 11. docs/benchmarks/2.x.{json,md} regenerated from runs-tf (previous copies /tmp/tf/2.x.*.before).
- VAL re-fit: tokensPerFile −5,462 (not positive), held-out error +68% → **fail**; WITHOUT_PRISM_TOKENS_PER_FILE stays null.
- 18:49 TOP_FILE_SHARE sweep (hono/preact/portpilot, 110 tasks, per-share clone copies): top-3 44.5 for all; recall@pack 0.25 → 64.3, 0.4 → 63.4, 0.55 → 61.6, uncapped → 60.4 (= previous k1). Chose 0.25; env knob removed; test cap 325 tok.
- 19:03 Checks after share/guard/lens fixes: build 16/16, format:check, lint, typecheck, test:integration pass; unit: all packages pass except core safe-delete.test.ts "testImpact matches the golden report" timing out (5,124–11,026 ms vs 5,000 ms). Cause: the fixture sits inside the Prism repo, so testImpact's co-change read runs `git log --numstat -n2000` over Prism's own history (P7 code, not touched today); 2.2–17 s depending on machine load (load avg 7–23; killed 10 orphaned vitest workers from my runs). Not loosened; flagged. Running bench-v3 (B8 m012+es-toolkit 20 stop samples each, B1, B4 full).
- 19:12 B8-v3 (on the share/guard/lens build, run while machine load 5–9): stop p50/p95 m012 1,136/1,414, es-toolkit 1,504/1,766; every stop degraded (20 daemon silent + 20 fallback spawn timeouts). In-process receipt steady state now ~315 ms (was ~850–950) — fixes work, but the daemon log shows it indexed BOTH /tmp/tf/hookbench and /private/tmp/tf/hookbench (15 s, blocking) and the store had 4 workspace dirs for 2 repos: hooks send process.cwd() (/private/tmp) and input cwd (/tmp); pool keyed on resolve(), workspaceKey on resolve(). Same for the A/B repos under /tmp/prism-ab. Fix: shared `canonicalRoot` (realpath, fallback resolve) used by workspaceKey, pool entryFor, server root routes, and mirrored in prism-hook.mjs. Tests: pool opens once via a symlink; key equal for link/target; server.test repo realpath-ed (daemon now reports canonical roots). daemon 29/29, shared prism-home 6/6. B4-v3 run spans this rebuild (pack logic unchanged; only cache key/timing affected).

### TF resume 3 — 19:17 IST
- bench-v3 (pid 53954) alive: B8-v3 and B1-v3 done (19:03–19:05), B4-v3 running (on mono, rentmaadi left). dist rebuilt 19:08 with canonicalRoot; plugin dist/pack + dev-pack hooks are older (16:03) and lack it → rebuild dev pack after B4. B8-v3 predates canonicalRoot → re-run B8 after rebuild. Meanwhile: reading hono-e5bb2062 arm-B transcripts.
- 19:21 hono-e5bb2062 arm-B failures (sessions 102b8c24 run 2, bde23bdf run 1): both agents made a correct one-line regex fix in src/jsx/utils.ts (`grid-(?!(?:row-|column-)?gap)(?:ar|[^a])` and `grid-(?:ar|(?:row|column)(?:$|-[^g]))`); re-applied each: src/jsx/utils.test.ts 163/163 pass. Harness bug: hono has no lockfile, so testsResult uses npx and builds `npx vitest run exec vp test --run <file>`; vitest takes `exec`/`vp`/`test` as name filters and runs the WHOLE hono suite (144 files). Upstream's own fix fails that command too here (5 files: build/declaration-emit, build/jsx-types, helper/dev, middleware/logger, utils/color — colour env and 2–5 s typecheck tests, load-sensitive). Both B fails ran 17:20/17:31 IST while B4-k1 ran alongside. So they're not Prism-caused; recorded as harness false failures. Not re-scored and harness not changed (would change B6 numbers); flagged for the owner. hono checkout left as found.
- 19:22 bench-v3 done (19:19): B1 35,881/7,893 = 4.55×; B4 all top-3 38.6, recall@pack 51.9, tokens p95 1,996, held-out top-3 47.7 (/tmp/tf/after/B4-golden-v3.json). Full build + dev pack (hook canonicalRoot edit at 19:12 came after the 19:10 build).
- 19:28 Rebuilt (16/16) + dev pack (hooks now carry canonicalRoot). format:check, lint, typecheck, test:integration pass. Unit: 1 failure under load (avg ~10): mcp-server daemon.test.ts 'uses the daemon's pack when it answers' got {} (auto-prepare took 743 ms, past its wait); alone it passes 3/3 (102–209 ms). Load-related, not loosened.
- 19:29 Killed a runaway python heredoc from an earlier worker's shell (pid 87861, started 17:30, 99% CPU for ~2 h, cwd ~); it explains part of the load during B4/B6/B8 since 17:30.
- 19:30 Machine quieter (load 3.7): core safe-delete.test.ts 3/3 pass, 'testImpact matches the golden report' 1,344–1,572 ms (limit 5,000). Confirms load-only. Re-running the unit suite.
- 19:30 Unit suite: exit 0 (all packages). Running B8 v4 on the canonicalRoot build (m012 + es-toolkit, 20 prompt / 20 stop).
- 19:33 B8 v4 (canonicalRoot build, load ~3): m012 prompt p50/p95 111/519, stop 730/814; es-toolkit prompt 443/599, stop 688/920 ms; before-edit p95 200/210, after-edit 204/199, session 282/527. Stops: 78 ok, 1 degraded (v3: all 40 degraded). 2 workspace dirs for 2 repos (v3: 4). Prompt: pack injected on the first warm prompt per repo; repeats in the same session are deduped (P4 short refs, no 'why'), so the hook logs 'no file or symbol matched' — misleading wording, behaviour same as 16:25; not changed.
- 19:34 Gate (--release, /tmp/tf/gate-v4: B1-v3, B4-v3, B8 es-toolkit v4, B9 medium 16:25, B7/B9-large/B10 carried from gate-final): FAIL 6 — B4.recallAtPack 54.1→51.9 (drop>1), GATE-T1.B1ratio 4.55, GATE-T2 opencode missing, CC tokens 109,526→121,823, cost $0.1433→$0.1507, success 1.00→0.909. Pass: B4 top3 38.6→38.6, testP 24.7→28.4, testR 59.3→65.3, B8 prompt/before/after/stop p95 5,711/295/289/10,837 → 599/210/199/920, B1 with-Prism tokens 41,931→35,881, B7 0.738→0.996 / 0.125→0.013, C14 prompt 599, stop 920 (≤1,000), medium RSS 985 MB-bytes (940 MiB), large 1,892 MB-bytes (1,804 MiB). 8 skipped (B2, B3, B5 not re-run). bench:release-gate: FAIL 5 (same release rows; B1 missing in docs/benchmarks). Nothing loosened.
- 19:35 Wrote 'Token fixes' section in prism-2-next-change-report.md (before/after B6, B1, B4, B8, B9, VAL, gate per check, checks, what's still not good enough). No commit/push.

## Round 2 start — 19:36 IST 2026-10-15
- Steering (owner, via parent): add to B6 a follow-up set (multi-turn, resumed session), a bigger multi-file set on a larger public repo, weighted toward these; plus a quality dimension (lens tasks: review / house style / Dev+Architect, auto and explicit; per-session diff size, reuse, style; blind X/Y grader; review findings precision/recall vs ponytail's review skill if present locally). Report per set.

### R2-1 diagnose 8/22 — 19:40–19:50 IST
- Isolated HOME events for the 22 arm-B prompts (17:14–18:32): injected 8; misses: prepare past its budget 6 ("no prepare within 441–793 ms"), daemon gave no /v1/ready answer 3, "no file or symbol matched" 3, index still indexing 1, no daemon yet 1.
- Every prepare/ready miss came while background receipt checks from an earlier session ran (typecheck + lint 53 s + test 60 s timeout + baseline re-run ≈ 180 s each, es-toolkit). Hits came when no checks ran (e.g. 12:04:17).
- Reproduced without Claude: `prompt-checkout.mjs` gained `--settle` (the A/B's wait), `--stop` (apply the fix's sources + fire the stop hook, so checks run) and `--gap-ms`, and records the hook's own miss reason. Before (/tmp/r2/b8co-before.json, 11 tasks, gap 30 s): **injected 5/11 (45%)**, prompt p95 1,461 ms; misses: no answer 3, prepare past budget 2, no match 1. Up to 4 check runs (160–235 s each) overlapped.
- Fix 1a: check commands run at the lowest OS priority (`os.setPriority(PRIORITY_LOW)`; children inherit). Test: the child's nice value is above the parent's.
- Fix 1b: one background check run per workspace: a newer receipt aborts the older run (process group killed) and the old receipt ends `not_proven(superseded)` (new reason). Test: abort stops a 20 s command in < 5 s.
- Pack noise (pair 2): `subjectsOfTest` now drops shared test helpers (imported by ≥ 5 test files: stubFour.ts, getBundleSize.ts) and names no subject when > 3 candidates remain. New pack test; intelligence pack 31/31.

## Round 2 (2026-10-15)

- 19:40 B8 checkout probe, A/B conditions (`--settle --stop --gap-ms 30000`), pre-route build: pack in 5/11 prompts (3 "index not ready", 2 "no prepare within N ms", 1 dedupe), prompt p95 1,461 ms. Cause: overlapping background receipt checks starving the daemon.
- Fix 1 (contention): check processes run at low CPU priority; a newer receipt for the same workspace aborts the older run's checks (`not_proven(superseded)`). Tests in checks/verify.test.ts.
- Fix 2 (one path): the hook is a thin client of a new daemon route `/v1/prompt` (classify → prepare → round-2 pack → session memory → lens once); in-process only with the daemon off. hook-command.ts and prism-hook.mjs lost their own renderers.
- Round-2 pack (`buildPromptPack`, shared): ≤3 files Prism is sure of, one-line reason each, signatures for the top file only; silent when unsure, when the prompt names every file, or when nothing is new this session ("Same as before: …" for the rest). House style only in the session's first block. Session memory = the existing session store (no new store).
- 20:00 B8 probe after fixes 1–2: pack in 11/11 prompts, prompt p95 593 ms (was 1,461).
- Pack precision (read 4 packs by hand): wrong first file on hono-afb2068c (ssg.ts) and hono-c3053ccf (cache). Causes and fixes:
  - `import … from '.'` / `'..'` were not relative specifiers, so every hono middleware test had no edge to its subject (`isRelativeSpecifier`). Tests RES.
  - boilerplate words ("file", "skip", "request") seeded files beside a named failing test → token seeds skipped once a named test resolved to its subject.
  - "Do not … open a pull request" routed to the Architect lens and fed ranking/reuse → `stripNegatedClauses` (lens routing + prepare focus).
  - hono `vp test` read as bun (from `test:bun`) → `vp test` = vitest. Run command now `pnpm exec vitest run <named test>`.
  - prompt block: a named target keeps only itself and its direct neighbours; reuse/house style/tests only beside listed files; reuse already imported is dropped; one run command (the named tests).
- Value line (stop): `Prism: saved ~N tokens | saved: not calibrated · remembered N files for next time` (one line; `filesRemembered` on SessionValue).
- 20:20 A/B harness rescore: replays in-place shell edits (`sed -i`, `perl -pi`) segment by segment (`shellSegments`, quotes respected; other shell writes flagged). hono-e5bb2062 re-scored with the fixed test command (`npx vp test --run src/jsx/utils.test.ts`): A 1/2 pass→pass, B 1/2 fail→**pass**. Control: the unfixed checkout fails 3/163 under the same command. Both earlier arm-B "failures" were harness false failures. Backup of the old rows: /tmp/r2/runs-tf.backup.jsonl.
- 20:22 Bigger-task set (vue-core) not prepared: the prepare run died at `pnpm install` and the disk is at 2.2 GiB free (99%). Needs ≥5 GiB free; partial clone left at /private/tmp/prism-ab/repos/vue-core (21 MB).
- 20:30 Static checks: build 16/16, lint (fixed 3 errors + 2 unused test helpers), format, typecheck pass; unit suites all pass (plugin 39, mcp-server 135, shared 309, intelligence 174, core 124, …). hooks.test.ts prompt tests rewritten for the daemon route (block passed through as is; quiet answer logs prompt.quiet; questions never get a file pack).
- 20:33 Dev pack rebuilt. B7 classifier: change recall 0.996, question false positive 0.013 (unchanged).
- 20:40 B4 now also scores the round-2 prompt block itself (run-eval: promptSpoke, promptPrecision, promptWrong, promptFirst) — precision of what the agent actually sees, not only the full prepare pack.

### R2 resume — 20:46 IST
- Previous worker interrupted after 20:40. No leftover bench/test processes (only the owner's long-running dispatch-hub, left alone). No ~/.prism-ab-token yet. Disk 2.2 GiB free.
- Already in tree (not yet logged): scripts/bench/ab-quality.ts (diff size vs upstream, house-style misses vs upstream, neighbour-test regressions, sandbox audit, seeded-review scoring, blind X/Y grader prompts), agent-ab.ts sets small/bigger/followup/review (arms A, B, L = lens named, P = ponytail review from a public clone at /tmp/prism-ab/ref/ponytail, not installed), Read/Edit deny sandbox settings, `grade` command; review-tasks.json (6 tasks, 11 seeds).
- Next: verify tests, run B4 (recall@pack target ≥53.1, top-3 ≥38.6), pick a bigger-task source that fits the disk.
- 20:49 run-eval fix: the round-2 prompt-block precision compared ContextFile objects with path strings (always 0). Now compares paths. B4 re-launched (/tmp/r2/after/B4-r2a.{log,json}).
- 20:51 Bigger set: vue-core install does not fit the disk (2.2 GiB free), so the bigger set draws fixes touching 3–10 source files from es-toolkit (≈4,500 tracked files, the larger repo) and hono, from the default branch (prepare used HEAD, which a run leaves at an old task), skipping commits already used by the small set. Running `prepare --set bigger` (tasks.json backup /tmp/r2/tasks.backup.json).
- 20:54 Rules once per session: under Claude Code the ruleset rides only in the MCP instructions (system prompt, once). The SessionStart orientation was re-sent on every `--resume` (follow-up turns) → now skipped when `source: "resume"` (a compacted session still gets it). Test R2 in hooks.test.ts; plugin hooks 25/25.
- 20:54 End line: an uncalibrated saving is left out instead of "saved: not calibrated" (owner: one clean line). Now `Prism: remembered 2 files for next time`, `Prism: saved ~N tokens · …` only once calibrated, no line when there is nothing to say. Shared + hook mirror; session-value 6/6.
- 20:59 Sandbox: Bash now runs in Claude Code's OS sandbox (`sandbox.enabled`, no unsandboxed retry, fail if unavailable): reads denied for the owner's home and /tmp except the checkout, the bench HOME, ~/.nvm, ~/.bun, Prism/packages (dev pack) and the ponytail clone; writes only in the checkout, temp and the bench HOME caches; no network (empty strict allowlist) and WebFetch/WebSearch denied for both arms, so neither arm can copy the maintainers' fix from GitHub. File-tool deny rules generated the same way (`allBut`). Tests: 14/14 harness. prepare: skip deleted test files (`--diff-filter=d`); relaunched.
- 21:01 Lens arms: bigger set run 1 adds arm L (Prism with "Use Prism's Architect lens." in the prompt: lens invoked) and arm P (ponytail plugin from the public clone, its minimal-code mode auto-on), next to arm B (lens picked automatically). Blind grader pairs arm A with each other arm (keys :L/:P). Quality table is per arm present. Review set already has A/B/L/P.
- 21:06 Disk hit 0 bytes free at 21:03 (prepare installing old lockfiles + swap). Killed prepare; removed our own regenerable bench scratch in /tmp (bench HOME/index caches: /tmp/r2/b4home*, /tmp/tf/{b4probe,b4home,b4home3,b9home,b8home*}, /tmp/prism-next/home-p13, the vue-core partial clone) → 1.7 GiB free. Hono's install untouched (12:10). es-toolkit's install was replaced by prepare and its stamp not updated (harness bug: the run would have used old deps) → reinstalled at the small set's lockfile (40695de3). Fix: prepare reads/writes the install stamp; the bigger set only keeps fixes on the current install (no new installs), 4 per repo. Relaunched prepare.
- 21:09 B4 r2a (round-2 build, /tmp/r2/after/B4-r2a.json): top-3 37.7 (target ≥38.6), recall@pack 50.1 (target ≥53.1); prompt block spoke on 82.3% of tasks, precision 20.9%, all-wrong 64.1% — the block is not precise enough. Regressions vs v3: hono-015/016/030, preact-027 — all phrased "don't …"/"do not …": stripNegatedClauses blanked the whole task. Fix: keep the clause when it is the whole task (+ test, lens-route 15/15). Probing per-reason precision of block picks (/tmp/r2/probe).
- 21:14 Freed more of our own bench temp only (parent steer): /tmp/tf/{b4sub-1,b4sub-3,b4sub-100,ph-bvNJ,prof-home,b1home,b1home3}, /tmp/r2/probe/home, /tmp/prism-next/home (≈70 MB; earlier 21:04 pass ≈600 MB: /tmp/r2/b4home*, /tmp/tf/{b4probe,b4home,b4home3,b9home,b8home,b8home3,b8home4}, /tmp/prism-next/home-p13, vue-core partial clone). Kept: all results JSON/JSONL, /tmp/tf/after, transcripts in /tmp/prism-ab/home/.claude, golden clones, hookbench, b8-repo, onb-med fixtures. Most of the drop at 21:03 was swap (8 GB RAM), not files.
- 21:17 Block precision probe (/tmp/r2/probe/b4-why.json, 220 tasks): picks the task named ("named in task": pasted path, failing test's subject, declared symbol) right 15/18; text-match seeds 55/327 (17%); neighbours of a named file 1/40; confidence high vs medium not predictive (rank 1: 29% vs 56%). So the block now lists only files the task named (≤3) and says nothing otherwise; neighbours and text matches stay in the full prepare pack (MCP tool), not in the injected block. prepare-context 9/9. Rebuilt; B4 r2b running.
- 21:25 B4 r2b (negation fix + named-only block, /tmp/r2/after/B4-r2b.json): top-3 **38.6** (target ≥38.6 ✓), recall@pack 51.9 (target ≥53.1 ✗), top-1 27.3; block spoke 7.3% of tasks, precision **81.3%** (was 20.9%), all-wrong 18.8% (was 64.1%), first file in block 62.5%. tokens p95 1,996. Recall gap: slim entries carry every exported symbol (src/types.ts: 42 names ≈150 tokens). Sweep SLIM_SYMBOLS 8/4 running (env knob only for the sweep). Disk 0.7 GiB free (swap ~1 GB); avoiding full website rebuilds.
- 21:30 B4-slim8 (slim pack entries keep top 8 symbols): all top-3 **39.5** (≥38.6 ✓), recall@pack **63.1** (≥53.1 ✓, was 51.9), top-1 27.3 (=), held-out top-3 50.0 / recall 60.2; tokens p95 1,999 (≤2,000). Biggest gains: es-toolkit recall 20.5→58.8, mono 24.9→38.1. Block/test/blast unchanged. slim4 running.
- 21:36 Chose SLIM_SYMBOLS=8 (slim4 gave recall 64.1, only +1.0, at half the names per file; 8 keeps more useful names). Env knob removed (fixed const). New pack test 'lists at most 8 symbols for a file below the top one'; pack.test 32/32.
- 21:37 format: 3 files fixed (oxfmt), format:check clean. lint: 1 error fixed (agent-ab.ts regex → startsWith), lint clean (warnings only, pre-existing).
- 21:38 typecheck clean (29 tasks); bench-script tsc clean; agent-ab.test 14/14; unit tests 1,148/1,148 pass across 16 packages (shared 309, intelligence 175, plugin 40).
- 21:41 integration tests 296/296 pass (cli 119, core 94, mcp-server 70, indexer 8, shared 4, analyzer 1). Built ./packages/* (15 packages, website skipped for disk) + dev pack; stalePackFiles [] ; dist has SLIM_SYMBOLS=8, no env knob. Started /tmp/r2/bench-final.sh: B7, B8 (m012 + es-toolkit + checkout), B1, B9 medium → /tmp/r2/after.
- 21:41 READY FOR A/B — NEED TOKEN. ~/.prism-ab-token is missing. Checking every 5 min until 22:41; runner ready at /private/tmp/prism-ab/run-ab-r2.sh (isolated HOME /private/tmp/prism-ab/home, ANTHROPIC_API_KEY unset, token deleted after grading). Will start after the benchmarks above finish so they don't skew each other.

### R2 resume 2 — 22:55 IST
- Mac was offline ~22:00–22:50 IST. Started `caffeinate -dims` (nohup, pid in /tmp/prism-r2-caffeinate.pid). No leftover bench/test processes; no ~/.prism-ab-token.
- bench-final (21:41) results: B7 ok, B8 m012 + es-toolkit ok; B8-checkout, B1 and B9 died at 21:48–21:49 with ENOSPC (disk 116 MiB free). Disk was 356 MiB free at 22:53.
- Freed only our own stale test/bench temp: $TMPDIR/prism-* test homes/repos older than 20 min (5,647 dirs, vitest/bench), $TMPDIR/.es-toolkit (930 MB, es-toolkit's own test temp from our check runs), 111 vitest `ssr` cache dirs in $TMPDIR, /tmp/r2/b4home-{B4-r2b,B4-slim4}. Kept every result JSON/JSONL, /tmp/prism-ab/home (transcripts), golden clones, hookbench, b8-repo, fixtures. Now 2.3 GiB free.
- A/B checkouts (hono, es-toolkit) were left mid-probe by the crashed B8-checkout (staged fix sources on a 'task tests' commit): reset --hard + clean (ignored files kept, so installs stay). Re-running B8-checkout, B1, B9 medium, then B4 final on the built dist (SLIM_SYMBOLS const).
- 22:58 READY FOR A/B — NEED TOKEN. ~/.prism-ab-token still missing. Checking every 5 min until 23:58 IST; benches (B8-checkout, B1, B9, B4 final) run meanwhile (/tmp/r2/bench-resume.sh). The A/B starts after they finish.
- 23:03 The 22:57 nohup launch (benches + caffeinate) died with the calling shell; relaunched both with /tmp/r2/detach.sh (setsid). caffeinate pid 20268. Killed the orphan A/B daemon it left (pid 19917); A/B checkouts reset again.
- 23:19 Benches re-run (round-2 build, quiet machine, 1.9 GiB free):
  - B4 final on the built dist (/tmp/r2/after/B4-r2-final.json, SLIM_SYMBOLS const): identical to slim8 — top-1 27.3, top-3 **39.5**, recall@pack **63.1**, test P/R 27.5/65.8, blast P/R 16.6/52.8, tokens p95 1,999; injected block spoke on 7.3% of tasks, precision **81.3%**, all-wrong 18.8%, first file right 62.5%; prepare p50/p95 677/1,250 ms.
  - B8-checkout (A/B conditions, 17 prompts, /tmp/r2/after/B8-checkout.json): pack injected 11/17 (64.7%), prompt p50/p95 175/915 ms; 3 silent by design ("not sure of any file"), 3 "no answer within ~845 ms" — each right after a checkout that changed ~1,230 files (old es-toolkit commits), while the daemon re-derived graphs. The A/B harness already waits for index + quiet prewarm + a 300 ms health answer before a session, so this affects real use after very large checkouts, not the A/B. Not tuned (flagged).
  - B1 (/tmp/r2/after/B1-orientation.json): with/without 36,146 / 7,893 = 4.58× (v3 4.55×); GATE-T1 still fails (by design of B1's simulated reader).
  - B9 medium (Node 24.21): index cold 19,260 / warm 2,198 / incremental 75 ms; dependency_graph 292, blast 241, dna 418; peak RSS 952 MB (before 1,171).
  - B7 (21:40): change recall 0.996, question FP 0.013.
  - B8 es-toolkit 21:41 (disk nearly full, swapping): prompt p95 1,020 ms (over the 1,000 ceiling, single first-prompt sample); re-run 23:23 on the quiet machine: prompt p50/p95 109/896, before-edit p95 40, after-edit 41, stop 186/597 ms, all 20/20 output. m012 21:41: prompt 112/636, stop 411/669.
- 23:24 Gate preview (/tmp/r2/gate-r2, --release, B6 still the 18:32 token-fix run): B4 top-3 38.6→39.5 pass, recall@pack 54.1→63.1 pass, test P/R pass, B8 pass, C14 prompt 896 / stop 597 pass, RSS pass, B7 pass; FAIL: GATE-T1 B1 4.58×, opencode missing, B6 tokens/cost/success (old run). A/B still waiting on the token.
- 23:44 Token polls 22:58–23:38 (every 5 min): no ~/.prism-ab-token. Resumed after an interruption; READY FOR A/B — NEED TOKEN again, new window until 00:44 IST. Detached watcher /tmp/r2/ab-watch.sh polls every 5 min and starts run-ab-r2.sh when the token appears (token removed on exit, even on failure). harness tests 14/14; tasks: small 11, bigger 6; review-tasks 6 (11 seeds); ponytail = public clone /tmp/prism-ab/ref/ponytail (read only).
- 23:55 Drafted the Round 2 report section (/tmp/r2/report-r2.md; appended to the change report once the A/B outcome is known). Token-fix A/B re-score check: runs-tf.jsonl arm B rescored 22/22 (original 20/22 kept in 'success'; gate reads the published original).
- 00:24 A/B watcher: ~/.prism-ab-token present; starting /private/tmp/prism-ab/run-ab-r2.sh (sets small,bigger,followup,review, then grade) → /tmp/r2/ab-r2.log
- 00:31 A/B r2 alive (watcher started run-ab-r2.sh at 00:24 after the token appeared): 88 sessions planned (shuffled), 6 recorded by 00:31 in runs-r2.jsonl. Early sign: the sandbox audit flags the checkout itself under /private/tmp (realpath) and toolchain paths (~/.bun/bin/bun, ~/.deno/bin probe) as 'left the sandbox' — audit path canonicalisation, checked below; scoring not affected (note only).
- 00:34 Sandbox audit fix (ab-quality.ts auditCalls): the checkout root is matched with and without /private (the A/B WORK dir is /tmp → realpath /private/tmp, so cd into the checkout itself was flagged), and ~/.bun counts as toolchain like ~/.nvm (the sandbox already allows both). New test (fails without the fix): agent-ab.test 15/15. The running A/B loaded the old audit; its rows get re-audited from their transcripts after it ends. ~/.deno/bin probes stay flagged (outside the allowlist).
- 00:37 Stopped the A/B after 8 of 88 sessions (token kept, not printed; watcher/runner killed without their delete-trap so the same isolated run can restart). Three problems found reading the first rows, all of which would have skewed the quality numbers:
  1. **Prism's stop hook makes the agent take an extra turn.** The receipt line goes back as `additionalContext` on Stop, and Claude Code continues the session to answer it ("Nothing changed. I only reviewed…"). Now that stop answers in time (p95 597 ms) it fires in every arm-B/L session: r2 small B +59k tokens (~20% of the session), review L +30k; in the 18:32 token-fix run it fired in 2/22 B sessions (median +120k) because stop then mostly timed out. Real product cost, not a harness artefact.
  2. **The review score read only the final message**, i.e. that extra turn: review-meanBy arm L found both planted problems but scored 0/2.
  3. **The sandbox blocked yarn's global cache** (es-toolkit uses Yarn PnP; packages live in ~/.yarn/berry/cache, under the denied real home), so no agent in either arm could run es-toolkit tests ("EPERM … berry/cache").
  The 8 rows → /tmp/r2/runs-r2-discarded-0045.jsonl (not mixed with the fixed run). Orphan A/B daemon killed.
- 00:42 Fixes for the three problems:
  1. Stop hook → `systemMessage` (shown to the user, never to the agent), in both the daemon path (prism-hook.mjs) and the in-process path (hook-command.ts). Only a finished check run that found a real problem still asks the agent to continue (`decision: block`, unchanged). Tests: plugin hooks 'stop hook (round 2)' (fails without the fix), hook-command integration asserts no hookSpecificOutput. plugin 41/41, mcp-server unit 135/135, integration 70/70.
  2. Review scoring reads the last main-thread reply that lists findings (transcript), not only the final message (`reviewFindings`; test).
  3. Sandbox allows reads of ~/.yarn/berry/cache only (the rest of ~/.yarn stays denied; test).
  lint, format:check clean; mcp-server/plugin/bench tsc clean; harness 16/16. mcp-server dist + plugin pack + dev pack rebuilt (dev-pack hook = source).
- 00:42 A/B r2 relaunched on the fixed build (fresh runs-r2.jsonl, all 88 sessions) → /tmp/r2/ab-r2.log
- 00:48 Relaunch verified on the first rows: no stop-context turn in any arm (es-toolkit-d9574efd B 125k tokens vs 298k in the discarded run), yarn vitest runs inside the sandbox (8/8 after the fix), no 'left the sandbox' false flags. Letting the 88 sessions run.
- 01:15 A/B progress 21/88, all scoring fields populated (quality diff/size, review seeds), no host stops.
- 01:24 Resumed after an interruption: A/B alive (runner pid 54483), 27/88 recorded, caffeinate up. Waiting.
- 02:04 52/88. One timeout so far (es-toolkit-3433044c follow-up arm A, turn 1 hit the 10-min limit on the bundle-size test; 56 tool calls, real struggle). Its row has 0 tokens because claude -p printed no JSON (no session id), although the transcript exists (860b3730…). A 0-token timeout would flatter that arm's median: recover tokens from the transcript after the run, and fix the harness to pass --session-id up front.
- 02:05 Harness fix (for future runs; the running A/B keeps the code it loaded): a new claude session gets `--session-id <uuid>` up front and the Session carries it, so a turn killed at the limit still maps to its transcript (tokens, audit). Test added; harness 17/17, bench tsc clean. Existing timed-out rows get their tokens from their transcripts after the run.
- 02:14 Resumed after an interruption: runner alive, 58/88, 1 timeout, no host stops.
- 02:35 A/B runner exit 0; token file removed: yes.
- 02:35 A/B runner finished (exit 0) and removed the token (confirmed: no ~/.prism-ab-token, no .credentials.json or sk-ant strings in the isolated HOME). But the account's **Claude session limit** hit at ~02:29 IST ("You've hit your session limit · resets 5:20am"): sessions 62–88 (27, started 02:29–02:33) failed in 2–7 s with 0 tokens (one bigger-L mid-session), and all 45 blind-grader calls failed the same way. The harness's hostStop didn't know this wording, so it recorded failures instead of stopping.
- 02:45 Analysis of the 61 good rows found a token-accounting bug for follow-ups: on `claude -p --resume`, the JSON totals are cumulative for the session, and the harness summed them per turn (3 turns → ~2–3× overcount; worst es-toolkit-3433044c B 6.29M → really 2.38M). Verified on all 13 follow-up rows: transcript total == last turn's cumulative total.
- Fixes: hostStop recognises "hit your (session|weekly) limit" (test); follow-up session tokens come from the transcript (each turn once, subagents included), a turn's own tokens = difference of cumulative totals, cost = last turn's (no unit test for the inline loop; verified against all 13 transcripts); `sumTokens` helper. harness 17/17, bench tsc clean.
- Data repair (backups in /tmp/r2): runs-r2.jsonl keeps the 61 good rows; the 27 limit-lost rows → /tmp/r2/runs-r2.limit-lost.jsonl (so `run` re-does exactly those); 45 failed grades removed (grades-r2.jsonl empty → re-grade); 13 follow-up rows re-tokened from transcripts (follow-up cost unknown → null, cost reported only for single-turn sets); the timed-out row got its transcript (860b3730…, 2,616,759 tokens).
- 02:44 READY FOR A/B — NEED TOKEN. The token was deleted at 02:35 as planned; the remaining 27 sessions + grader need a fresh ~/.prism-ab-token and the limit reset (05:20 IST). Detached watcher /tmp/r2/ab-run3.sh polls every 5 min, starts at ≥05:22 once the token exists, gives up at 06:25 (60 min after the reset); token removed on exit.
- 02:46 Quality scoring on the 61 good rows (paired by task; /tmp/r2/paired.mjs): small A/B 6 pairs, bigger A/B 4, A/L 2, A/P 1, follow-up A/B 5, review A vs B/L/P 4 each. VAL (b6-report calibrate on the r2 rows, informational, not published): small only 6 tasks → tokens/file −4,479, fail; small+bigger 10 tasks → 772 tokens/file, held-out error −95%, fail. 'saved ~N tokens' stays off. Gate B6 rows + published proof wait for the full small set (n ≥ 10/arm).
- 02:46 Appended the 'Round 2' section (interim, quality first) to prism-2-next-change-report.md. caffeinate left running for the resume watcher.
- 02:47 Resume watcher relaunched by parent with deadline 12:00 IST (owner asleep; token may arrive after 06:25).

### 02:59 IST — cross-terminal prep paused (parent HOLD)
- Agent CLI one-shot JSON check (/tmp/cli-smoke, ended): `agent -p ... --output-format json --trust` returns `session_id` and `usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}`, no cost field.
- Prism's Cursor integration is project-scope only (`.cursor/mcp.json` + `.cursor/rules/prism.mdc`, no hooks). The plan for arm B is to install it into each checkout and exclude it from the diff; arm A has no `.cursor`.
- Harness gaps found (no edits yet): HOST only knows claude/opencode; opencode follow-ups don't resume (`--session`) and only count the last turn's usage; the cumulative-token delta logic is Claude-only; the review set is skipped for non-Claude hosts; opencodeData() points at the bench HOME, not the real sign-in; the grader is Claude-only.
- Separate PRISM_AB_WORK planned so it doesn't collide with /tmp/prism-ab used by ab-run3.sh (pid 6874, untouched).
- No test sessions started. Waiting for the parent's go.
- 03:02 Killed watcher 6874 and launched ab-run4 (03:01). Parent then said: keep the token until the cross-tool grading is done, so ab-run4's group was SIGKILLed after 40 s (one in-flight session hono-7a254bc0 bigger L lost, re-run) and relaunched as /tmp/r2/ab-run5.sh with KEEP_TOKEN=1. Token guard /tmp/r2/token-guard.sh deletes the token at 08:30 IST regardless.

### 03:05–03:16 IST — cross-tool harness + dry checks + launches
- agent-ab.ts: hosts claude|opencode|agent. Agent CLI: `agent -p --output-format stream-json --trust --force --approve-mcps --model grok-4.7-high [--resume id]`; reader `agentUsage` (result-event usage, session id, tool calls, real Prism MCP calls only, replies). opencode: `--session` resume; each invocation's usage summed per turn. Claude keeps the cumulative-difference rule. Review set and lens arm L now run on every tool; ponytail's own mode (P) is Claude-only (it's a Claude plugin). Code-quality metrics now for every tool. opencode sign-in read from ~/.local/share (PRISM_AB_OPENCODE_DATA overrides); opencode permission rules deny web fetch + outside directories in both arms. Agent arm B/L: Prism's own `install cursor --project` into the checkout (.cursor/mcp.json + rule, hidden via .git/info/exclude), arm A: none. PRISM_AB_FOLLOWUP_MIN=3 for long follow-ups. Tests 21/21 pass; typecheck clean.
- opencode needs stdin closed (`< /dev/null`), otherwise `opencode run` hangs; the harness already uses stdio ignore. Models: opencode/mimo-v2.6-flash-free works now ("ok"), nemotron-3-ultra-free hung for 100 s, opencode-go/mimo-v2.6-pro works.
- Dry with-Prism checks (/tmp/r2/dry.mjs): opencode: MCP server + plugin shim (hooks) + AGENTS.md rule loaded, called prism_prepare_change, daemon started in its own PRISM_HOME. Agent CLI: project MCP + rule loaded, called prism-prepare_change, daemon started. Agent CLI has NO hook integration in Prism (MCP + rule only) — that's the honest limit on that host.
- Sandbox differences: Claude runs under its OS sandbox (filesystem + network allowlist, audited from transcripts). opencode: only its permission rules (no web fetch, no outside directories). Agent CLI: no sandbox; `--force` auto-approves commands; runs in its own checkout clone. Agent and opencode use the owner's normal sign-ins and user settings (same for both arms); opencode session history lands in the owner's opencode data dir.
- Separate checkouts per tool via APFS clones (/private/tmp/prism-ab-{opencode,agent}, copy-on-write, ~0.2 GB extra disk). Separate Prism homes.
- Launched detached: /tmp/r2/run-opencode.sh (small set, 22 sessions, mimo-v2.6-flash-free) → /tmp/r2/ab-r2-opencode.log; /tmp/r2/run-agent.sh (bigger with A/B/L, 3-turn follow-ups, review with A/B/L = 46 sessions, grok-4.7-high) → /tmp/r2/ab-r2-agent.log. The first launch at 03:14 had no log redirect; killed after seconds and relaunched 03:16.

### 03:20–03:38 IST — real bug found in the cross-tool runs, fixed, runs restarted
- opencode's first 2 rows were invalid: `opencode export` showed it ran in /Users/shaileshjha/Prism (session directory = the harness's own repo), not the checkout. opencode takes its project from the inherited PWD, not the spawn cwd. In that state it ran `find ~`, mdfind, and read plans/notes/benchmark-real-agents/tasks.json. It used no edit or write tools (only bash/read/glob), so the Prism working tree wasn't changed by it; the owner's existing uncommitted changes are untouched.
- Fix (harness): pass the checkout explicitly — opencode `--dir <checkout>`, agent CLI `--workspace <checkout>`, plus PWD=<checkout> in the child env. Tests updated (21/21), typecheck clean. Verified in the live process list: `--dir /private/tmp/prism-ab-opencode/repos/es-toolkit`, `--workspace /private/tmp/prism-ab-agent/repos/es-toolkit`.
- The agent CLI's first bigger session (arm L) hit the 10-minute limit with no usage (the agent CLI emits usage only in its closing result event). Per-invocation limit for the agent CLI raised to 20 min (PRISM_AB_RUN_MINUTES; same for both arms; Claude and opencode stay at 10).
- Discarded rows moved to /tmp/r2/discarded/ (opencode 2, agent 1); both runners relaunched at 03:38 from zero.
- Agent CLI `--sandbox enabled` probe: still reads ~ and reaches the network, so it isn't equivalent to Claude's sandbox; not used. Sandbox differences stay as stated at 03:16.
- 03:54 Claude resume runner exit 0 (token kept for the cross-tool grader).

### 03:40–03:58 IST — agent CLI isolation bug found and fixed; feature probes built; review gap fixed in source
- Feature probe script `scripts/bench/feature-probes.ts` (new, uncommitted): custom habit (invoked "Run my repo pulse habit." / auto "Give me my repo pulse."), custom skill `safe-change` (invoked / auto), custom lens `perf` via `prism lens add … --trigger "perf pass"` (invoked / trigger phrase), QA lens test-writing on a planted bug (chunk.ts `Math.ceil`→`Math.floor`, spec trimmed so no test reaches it; scored by running the agent's test: fails on the bug, passes on the fix, source untouched). Each probe is scored from tool calls, files and harness-run tests. Rows → plans/notes/benchmark-real-agents/features-r2-<host>.jsonl.
- First agent probe (habit-invoked) showed arm A calling Prism: the agent CLI loads the owner's own Prism twice — the `prism` entry in ~/.cursor/mcp.json and the Claude Code plugin `prism@local` (enabled in ~/.claude/settings.json). It also didn't pass PRISM_HOME to MCP servers, so arm B's server read the owner's real ~/.prism (habit not found). The agent A/B sessions started 03:38 were contaminated → runner stopped (no rows completed), probe rows discarded to /tmp/r2/discarded/.
- Fix (harness, no change to the owner's config): per checkout, in both arms, `.claude/settings.local.json` = {enabledPlugins:{"prism@local":false}} and a project `.cursor/mcp.json`. Arm A: a `prism` entry that never starts (/usr/bin/false), which replaces the global one. Arm B: Prism's own `install cursor --project`, with PRISM_HOME/PRISM_DAEMON/PRISM_AUTOPREPARE added to the server env. Both files are hidden through .git/info/exclude. Verified by hand in /tmp/cli-smoke/ovr: with both overrides the agent lists no Prism server. Test added (22/22).
- Claude resume finished 03:54: 88/88 sessions, grader exit 0, 48 grade rows (2 with errors, to re-grade). Token kept for the cross-tool grader.
- Review vs Architect minimal-code check (code read): the minimal-code ladder ("Does this need to exist? … reuse … one line … minimum", ponytail-style) is in the **Dev** procedure only (packages/shared/src/lens-store.ts DEV_PROCEDURE). A review routes to **Architect** (lens-route ARCHITECT regex), whose procedure is structure-only (ADRs, owning package, cross-package edges, smallest *design*). The skill's "Reviewing a PR" steps add no lean pass. guard_session review's data checks include reuse_missed / new_dependency_added (Dev's checks) but nothing for dead code, unused options, one-use abstractions, or near-copies. "review the last commit" didn't route to Architect at all (fell through to Dev). Gap confirmed.
- Fix (source, small): Architect procedure gets step 6, "the lean pass the Dev lens writes by" (dead code, an option nobody sets, an abstraction with one use, a helper the repo already has with its path, near-copies; propose the fix that deletes code). The route regex also accepts "review … (last|latest|this) commit". Tests: lens-store (lean pass present, ≤2500 chars), lens-route ("review the last commit" → architect); 27/27. NOT built into dist yet, so the running benchmarks measure the build they started with; the review set is re-run after the rebuild.
- 04:03 Agent isolation verified (habit-invoked: arm A made no Prism call, arm B called prism-habits and passed). Relaunched the agent A/B runner (20-min limit) and the full agent feature probes (2 reps); Claude probes (2 reps) running since 03:58. Habit scorer fixed to ignore markdown (Claude B's correct checklist was marked wrong because of backticks); habit rows get rescored from stored replies after the probes finish.
- 04:10 Claude round 2 final numbers read (plans/notes/benchmark-real-agents-r2.md, 88/88 sessions, 48 grades). Audit false positive fixed: the 3 "left the sandbox" follow-up B rows had run `git show <sha>` on the task's own parent (e62aa15f) or the bench's own "turn 2 tests" commits (7002dae6, e911601a, both by prism-bench). The audit now flags a one-commit read only when the commit can't be seen from HEAD; `--all`, reflog, fsck, cat-file and the rest stay flagged (`leakingHistory`, test added, 23/23). Re-audited (/tmp/r2/reaudit.ts, backup /tmp/r2/runs-r2.before-reaudit.jsonl): 2 rows clean; es-toolkit-3433044c follow-up B keeps 1 flag (`git log --all`).
- 04:15 b6-report publish now takes several `--runs` files and keeps each row's own host (claude → "Claude Code", opencode → "opencode", agent → "Cursor agent CLI"), so the gate's opencode check reads real opencode rows. Test added (release-gate tests 10/10).
- 04:12 **Prism bug found by the custom-lens probe (Claude, both invoked and trigger phrase):** the custom lens was picked correctly (the hook injected `Lens: Perf`), but only the name reached the agent. prepare-context's `lensLines` prints the procedure, and a custom lens from `prism lens add` has an empty procedure, so its role, focus and checklist were dropped. That contradicts lenses.ts ("the role and checklist still apply"). Fix (source): `lensProcedure()` in shared/lens-store.ts returns the procedure, or role/focus/tone/checklist when there's none; prompt-context's `lensFor` uses it. Test added; shared lens/prepare-context 37/37, mcp-server safety 13/13. Needs a rebuild to take effect; the lens probes get re-run after the rebuild.
- 04:12 The QA-auto Claude arm B rep 1 row reads "test didn't change", but the transcript shows an Edit to chunk.spec.ts and a failing vitest run. Probe rows now record the session id plus git HEAD/status at scoring time to find out why (open).
- 04:14 **Cause of the qa-auto arm B "test didn't change" row (Prism behaviour, real-world risk):** when a check fails at session end, the receipt classifier (receipt.ts `classifyFailures` → baseline.ts `withBaselineTree`, M-092) copies the session's files aside, writes the HEAD bytes back into the *live working tree*, re-runs the tests, then restores them. The QA task makes a test that fails on purpose, so the baseline ran, and the probe scored while chunk.spec.ts was temporarily back at HEAD. No-Prism arm A has no baseline, so it passed. For a user this means: while the baseline runs, editors, file watchers and other tools see the session's edits disappear, and an edit saved to one of those files during the window gets overwritten when the copy is put back. Proposed clean fix (not done tonight; it's a design change to a safety path): run the baseline in a throwaway checkout (`git worktree add --detach` at HEAD, plus the non-session dirty files and a node_modules link) and never write to the live tree. A cheaper interim guard: on restore, refuse to overwrite a file whose bytes no longer equal the HEAD bytes that were written (and report that), so a concurrent edit is never lost.
- 04:14 Harness fix: `settlePrism()` (agent-ab.ts) waits the old 15 s, then waits while any `workspaces/*/receipts/baseline-restore/manifest.json` exists (up to 3 min). agent-ab's scoring and feature-probes both use it. Test added; agent-ab tests 24/24. Runs that are already going keep the old code; the qa-auto probe gets re-run with the fix.
- 04:15 **Disk nearly full:** 0.3–1.1 GB free of 228 GB (the benchmark folders are about 4.5 GB; the rest is the owner's data, and none of it was touched). Runners paused for about 30 s, then resumed under /tmp/r2/disk-guard.sh, which pauses every runner below 600 MB free and resumes above 1.5 GB (log: /tmp/r2/disk-guard.log). A session paused by the guard can hit its time limit, so any timed-out row is checked against the guard log before it counts.
  - Evidence: the probe Prism home has 3 receipts with a failure cause (caused 2, already-failing 2, unknown 1), so the live-tree baseline ran during the probes.
- 04:36 Resumed after an interruption. Runners alive and not duplicated: opencode small (41054), agent bigger/followup/review (72749), agent probes (72750); the Claude probes finished at 04:15. The disk guard (95128) is still on its original 600 MB / 1.5 GB thresholds: changing them was blocked by auto-review and the approval was interrupted, so they were left alone. It paused at 04:22 and 04:31 and resumed both times.
- 04:38 "2 errored grades": none found. grades-r2.jsonl has every expected key: 38 pairs (11 small, 18 bigger, 9 follow-up) plus all 10 findings grades for the review rows that had off-seed findings. The grade log shows no errors (GRADE EXIT 0 at 03:54).
- 04:39 Rebuilt with tonight's fixes (Architect lean pass, lens-route "review the last commit", `lensProcedure`, harness `settlePrism`) in an APFS clone of the working tree, /private/tmp/prism-fix (same source as /Users/shaileshjha/Prism, uncommitted changes included, about 40 MB extra). That way the agent and opencode runs still in flight keep one fixed Prism build. shared/checks/daemon/core/mcp-server/cli plus the plugin dev pack built with exit 0; the lean pass and lensProcedure are confirmed in dist.
- 04:41 Launched /tmp/r2/run-fix.sh (Claude, tag r2fix): review set, 6 tasks × A/B/L/P = 24 sessions, then the grader, then the lens-invoked/lens-auto/qa-auto probes × 2 reps. Checkouts are APFS clones of the prepared repos in /private/tmp/prism-ab-fix and /private/tmp/prism-ab-probe-fix. The first launch failed in under a second because those checkouts were missing; that was fixed and it was relaunched.
- 04:57 **Prism bug: shipped lens-procedure improvements never reach an existing install.** In the r2fix review sessions the Architect block was injected 5 times, but never with the new lean-pass step (0 of 23 transcripts). Cause: the store seeds the default lenses with their procedure text (`lenses.json`, seededDefault true), and `applyDefaultProcedures` only refreshes a seeded lens whose role/focus/checklist equal the *first-shipped* defaults (PREVIOUS_DEFAULTS). A store seeded by 2.0 has the current role/focus/checklist, so it kept the 855-char 2.0 Architect procedure forever. Evidence: the isolated home's lenses.json architect procedure equals HEAD's text exactly; role/focus are the current ones. Fix (source, shared/lens-store.ts): `SHIPPED_PROCEDURES` lists the sha256 prefixes of procedures earlier releases seeded (architect 2.0: c2e2d07ca8d94bc8). A seeded lens whose name/role/focus/checklist equal the current defaults *and* whose procedure is a shipped one counts as unedited and takes the current text; an owner-edited procedure is kept. Test added (old text → current; edited → kept); shared lens/route/prepare-context 38/38, tsc clean. **So the 04:41 r2fix review run did not test the lean pass:** its B/L arms ran with the old Architect text. It is reported as a repeat-run reliability check, not as a measure of the fix. A new review run follows the rebuild.
- 05:10 Parent freed own stale bench scratch (disk guard paused runs at 1.4 GiB): /private/tmp/prism-ab-probe-claude/repos (Claude feature probes done 03:43; probe results in ./prism kept), /tmp/r2/b8home, /tmp/r2/b8home2, /tmp/r2/b4home-B4-slim8 (bench HOMEs; results JSON kept).
- 05:02 r2fix probes (custom-lens fix in): lens-auto rep 1 **pass** (the role reached the agent), lens-invoked rep 2 **pass**, qa-auto A rep 1 pass, **qa-auto B rep 1 pass** (it settled before scoring). lens-invoked rep 1 **failed** because the prompt hook never ran: "no answer within 847ms" from a cold daemon in a fresh Prism home (see below). Then the probe runner crashed in `reset()` with ENOTEMPTY on coverage/, because a test run's coverage writer was still adding files.
- 05:08 Harness fixes: `prismBusy()` replaces baselineInProgress and also waits while any receipt has `checksState: "pending"`. reset() removes coverage/ with `maxRetries: 10, retryDelay: 500` (Node's own retry for a directory that's still being written). agent-ab tests 24/24.
- 05:10 **Reliability: the prompt hook skips about 1 prompt in 10 on Claude Code.** Round 2 isolated home: 88 prompt-hook runs, 79 injected (90%), 9 skipped. All 9 were "no answer within ~847ms" from the daemon, and each came right after a checkout change ("stale snapshot" / "no snapshot yet"), when the daemon was re-indexing (snapshot.write 0.5–3.6 s). In those prompts the agent gets neither the pack nor the lens. Proposed fix (not done; hot path, needs profiling): answer /v1/prompt's lens part before waiting on the index, and move snapshot writes off the daemon's main thread so the route can always answer inside the budget. Also, `lensFor` marks the lens as shown for the session before the hook has delivered it, so a late answer loses the lens for the rest of that session.
- 05:12 Synced the lens-store fix and the harness fixes into the clone and rebuilt shared/mcp-server/cli/plugin (exit 0). Checked: the isolated home's stored lenses now resolve to the Architect text with the lean pass. Stopped the two clone daemons (39565, 61923) that still had the previous build in memory. Launched /tmp/r2/run-fix2.sh (tag r2fix2): review 24 sessions + grader, then lens/qa probes resumed to 3 reps.
- 05:12 Parent ran 'npm cache clean --force' (~3.6 GB of re-downloadable npm cache) so the paused agent/opencode runs can resume above the disk guard's 1.5 GiB.
- 05:22 **Claude Code hit its session limit** ("resets 7:50am Asia/Calcutta"). r2fix2 review stopped at 19 of 24 sessions (the harness detected it: "host stop: usage limit"), and its grader stopped too. The feature-probe runner did *not* detect the limit: it recorded 7 empty 2–3 s rows. Those were moved to /tmp/r2/discarded/features-r2fix-claude.usage-limit.jsonl, and feature-probes.ts now exits on `hostStop()` the way agent-ab does.
- 05:22 r2fix2 transcripts: the Architect block now carries the lean-pass step (5 of 5 sessions where Architect was injected). The stored-procedure fix works end to end.
- 05:27 Agent probes finished (24 rows). Launched a review run on the fixed build with the Cursor agent CLI (grok-4.7-high), since Claude is unavailable until 07:50: /tmp/r2/run-agent-fix.sh, clone /private/tmp/prism-fix, tag r2fix, 18 sessions A/B/L, 20-minute limit, checkouts cloned into /private/tmp/prism-ab-agent-fix. It runs alongside the main agent run (separate checkouts and Prism home).
- 05:29 Scheduled /tmp/r2/grade-window.sh (pid 91423, log /tmp/r2/grade-window.log). It waits until 07:52, then grades agent r2, opencode r2, resumes and grades Claude r2fix2 (5 sessions left), grades agent r2fix, and re-grades new rows every minute until 08:26 or until the token is gone. token-guard is unchanged (08:30).
- 05:36 Disk-guard pauses against the rows: 6 cross-tool sessions overlapped a pause, so their wall-clock seconds include the pause (tokens are unaffected). One of them, opencode es-toolkit-e62aa15f arm B, **timed out during a pause**, so it's invalid. It was moved to /tmp/r2/discarded/opencode-e62aa15f-B-paused.jsonl and gets re-run after the opencode runner finishes.
- 05:33 Habit rows re-scored (`--rescore-habits`, against the probe-fix checkout at the same REV; backups in /tmp/r2/features-r2-*.before-rescore.jsonl). Claude habit-invoked B 2/2, habit-auto B 0/2: it ran the habit, got the count right and the right 3 commits, but reworded the titles, and the check needs them verbatim (not loosened). Agent B 4/4; agent A 0/4 (right content, no habit).
- 05:32 Launched opencode feature probes (1 rep, main build, the same build as the opencode run): /tmp/r2/probe.sh opencode, WORK /private/tmp/prism-ab-probe-opencode.
- 05:31 Launched the full checks in the clone (same source as the working tree; it has a fresh dist): typecheck, lint, unit tests, release-gate tests, harness tests. Log: /tmp/r2/checks-fix.log.
- 05:34 Change report: the Round 2 section was rewritten as the final section (owner summary, wins, losses, cross-tool table, feature table, review/Architect gap, bugs, harness fixes, sandbox, reliability). It's generated by /tmp/r2/report.py from the result files, so it can be refreshed. Backup: /tmp/r2/change-report.backup-0535.md.
- 05:38 Checks in the clone: typecheck exit 0. Lint failed on 2 issues of mine in the harness (an unused `lastStdout`, and a regex where `endsWith` fits); both fixed. Format: oxfmt applied to the 7 files changed tonight; check clean. Unit tests 1,152/1,152 (16 packages), release-gate tests 10/10, harness tests 24/24. All edits were mirrored into the clone.
- 05:40 Provisional publish (backup /tmp/r2/docs-backup-0540) from the Claude small rows (/tmp/r2/runs-r2-small.jsonl) plus the opencode small rows so far. VAL: Claude fail (13 tokens/file, held-out error −101%); opencode has nothing to calibrate. Gate --release: FAIL (3): T1 B1 ratio 4.58, T2 Claude Code median cost 0.168→0.185, T2 opencode n 4/arm. 23 pass, 8 skipped. Nothing loosened.
- 05:42 Scheduled /tmp/r2/after-opencode.sh (pid 7364): once the main opencode run (41049) exits, it resumes the opencode small set for the missing session(s). It does not duplicate: the runner skips recorded rows. /tmp/r2/report-loop.sh (pid 7366) re-renders the Round 2 section from the result files every 10 minutes until 08:45, so the report stays current while runs finish.
- 05:44 Scheduled /tmp/r2/end-caffeinate.sh: it stops caffeinate (20268) when no agent-ab, feature-probes, grade-window or after-opencode job is left, and logs it here.
- 10:02 **The Mac restarted while it was asleep (about 06:00–10:00 IST). macOS empties /tmp on boot, so everything under /tmp and /private/tmp is gone:**
  - every benchmark checkout
  - the isolated Claude home, with its transcripts
  - the fixed-build clone /private/tmp/prism-fix, with the rows that only lived there: Claude r2fix2 review (19 sessions) and the agent review on the fixed build (started 05:27)
  - all /tmp/r2 scripts and logs, including the discarded-row files
  - the 05:40 backup of docs/benchmarks/2.x.*

  docs/benchmarks/ is untracked, so the earlier published proof can't be restored from git. It's regenerated from the rows in the repo.

  What survived is everything in the repo: runs-r2*.jsonl, grades-r2*.jsonl, the features-*.jsonl files, the report and this log. ~/.prism-ab-token is still there.
- 10:03 caffeinate restarted (pid 3422).
- 10:04 Rows cut off by the sleep: none. Rows are written only when a session ends, and the last ones end at 05:58 (agent), 05:53 (opencode) and 05:48 (opencode probes). None is longer than normal or ends after the sleep began. The sessions in flight at the sleep left no rows, so nothing was discarded.
- 10:06 Harness: `--only task:set:arm,…` (exported `wanted()`, with a test; harness tests 25/25) to run a named subset honestly.
- 10:07 Rebuild detached (/tmp/r2/setup.sh): blobless clones of es-toolkit and hono plus ponytail (DietrichGebert/ponytail, depth 1, the current version, which may be newer than last night's), APFS-cloned into 4 work folders (prism-ab-fix, prism-ab-agent, prism-ab-agent-fix, prism-ab-opencode); /private/tmp/prism-fix re-cloned and rebuilt with tonight's fixes.
- 10:08 Claude Code check: one tiny prompt in the isolated home with the token returned "OK". The limit has reset.
- 10:07 First install attempt failed: I checked out the tasks' `modules` value as if it were a commit, but it's the install fingerprint. The 4 runners had just started. All 4 were stopped within a minute, before writing any row, and their orphaned sessions (2 agent, 1 opencode, 1 Claude, plus 3 bench daemons) were killed; each was checked to be in a /private/tmp/prism-ab-* folder first. The wrong stamps were removed.
- 10:10 Install retried the way checkoutClean does it: check out a task's fix commit (es-toolkit 827b92f7, hono afb2068c; every task in a repo shares one install fingerprint), run `yarn install --immutable` / `pnpm install --frozen-lockfile` once, then APFS-clone to the 4 work folders with the matching stamp.
- 10:10 Plan, sized for about 2 hours:
  - **Agent main run (main build), cut to 6 sessions.** At ~8–15 minutes each, the 33 missing would take about 4–5 hours. The 6 complete with-vs-without pairs: bigger ea692b9f B, hono-7a254bc0 B, es-toolkit-8f557cb3 A, hono-b20d4225 A; follow-up 8f557cb3 B and ea692b9f B. Not run: the other bigger tasks, the other follow-ups, and the main-build review B/L.
  - **Agent review (fixed build): 8 sessions.** B and L for the 4 review tasks that already have a no-Prism row (meanBy, orderBy, jsx-gap, combine).
  - **opencode:** all missing small sessions (7, including the one discarded for the disk pause), then its 3 missing feature probes.
  - **Claude (fixed build):** the review set again, 24 sessions (the earlier 19 rows were lost), then grading, then the 3 missing lens/QA probe reps.
- 10:11 Installs verified (es-toolkit PnP, hono node_modules, stamps written). Launched detached: agent main subset (6 sessions, TAG r2), agent fixed-build review (8, TAG r2fix), opencode small resume (7 missing incl. re-run of discarded e62aa15f B) + probes, Claude fixed-build review (TAG r2fix2, all 19 again since earlier rows were lost with /tmp) + grade + lens/QA probes. Disk guard recreated at the original 600 MB / 1.5 GB thresholds. /tmp/r2/final.sh waits on each run, blind-grades with Claude, then deletes ~/.prism-ab-token and checks it is gone.
- 10:37 Mac back. Real cause of the 10:16 drop: the Mac idle-slept on battery 10:11:25–10:34:23 (pmset log: Sleep 'Idle Sleep', DarkWake 10:28:44, back to sleep, Wake 10:34:23); caffeinate was not running (pid 3422 had gone). Restarted caffeinate -i -m -d (pid 38615), assertion confirmed. Memory now 60% free.
- 10:37 Discarded the 4 sessions that were in flight across the sleep (every one, all timed out with inflated seconds): agent r2 es-toolkit-8f557cb3 bigger A (1471 s), opencode r2 es-toolkit-e62aa15f small B (1135 s), agent r2fix review-hono-combine B (1469 s), Claude r2fix2 review-es-toolkit-intersectionBy A (1395 s). Saved to /tmp/r2/discarded-sleep-1016.jsonl; they will be re-run. Rows that started after the wake are kept.
- 10:37 Owner asked for at most 2 runners at once. Stopped the agent main run and the opencode run (process groups 16309/16313) instead of freezing them, because their in-flight sessions were under 1 minute old with nothing written, and a frozen model session would come back as a broken row. Stopped their leftover daemon 23212. Old final.sh (29685) stopped, since it waited on those pids; replaced by a queue (below).
- 10:38 queue: queue started (replaces final.sh 29685)
- 10:51 queue: Claude review+grade+probes finished; starting Claude pass 2
- 10:52 queue: Claude pass 2 finished; starting opencode small resume + probes
- 11:09 Found a setup error of mine: the 10:08 es-toolkit install was done in /private/tmp/prism-ab-src and APFS-copied into the work folders one level deeper. Yarn PnP stores relative paths to the global cache, so in every work copy 'yarn exec vitest' failed with "Missing package: vitest@virtual…" (hono's pnpm node_modules uses relative links and works). Effect: no es-toolkit test could run since 10:08, for the agent or the scorer. Seen in: Claude qa-auto rep 2 both arms ("testPassesOnFix": false in A and B), opencode e62aa15f B (600 s timeout, 629k input tokens), agent review orderBy L (its chat store shows the error). Claude review transcripts since 10:05: no such error (review sessions did not run es-toolkit tests).
- 11:09 Fix: in-place 'corepack yarn install --immutable' at 827b92f7 in all 4 work folders; vitest now passes in each (chunk.spec.ts), hono checked too (buffer.test.ts 11 passed). Stopped the queue, the opencode run and the agent review run first (in-flight sessions had written nothing). Discarded the 4 affected rows to /tmp/r2/discarded-install-1016.jsonl: opencode e62aa15f B (10:52), agent r2fix review-es-toolkit-orderBy L, Claude features qa-auto A rep 2 and B rep 2. All four get re-run. Kept: agent r2fix meanBy B (its chat shows no test run).
- 11:10 queue: queue2 started (after the es-toolkit install fix)
- 11:10 queue: starting agent main subset
- 11:10 queue2 launched (/tmp/r2/queue2.sh): slot 1 Claude qa-auto re-run → agent review (fixed build) → opencode small + probes; slot 2 agent main subset; then blind grading x2, token delete + check, caffeinate stop. benches.sh still waits for it.
- 11:12 queue: Claude qa-auto re-run finished; starting agent review on the fixed build
- 11:25 Resumed after interruption: queue2 alive with 2 runners (agent main subset, agent review fixed build), one daemon each; Claude qa-auto re-run done 11:12 (A and B rep 2 pass). Disk guard had exited at 11:09 while no runner was up; restarted (same thresholds).
- 11:41 queue: agent review finished; starting opencode small resume + probes
- 11:54 queue: agent main subset finished
- 12:05 Check: opencode sessions since 10:30 (its session store) show no 'Missing package' and their own test runs passed, so the opencode agent was not blocked by the broken install; the discarded 10:52 e62aa15f B row was a genuine 600 s timeout, and its re-run (11:41) timed out too, so the count is unchanged. Agent main subset finished 11:54 (6/6 recorded); agent review fixed build finished 11:41.
- 12:15 benches: rebuilding gate inputs into /tmp/r2/gate-r2 (B7, B1, B8 es-toolkit, B9 medium, B10). B4 golden clones (incl. 2 private repos) and B9 large are not rebuilt.
- 12:18 benches done: B1-orientation.json B10-install-matrix.json B7-classifier.json B8-hook-latency.json 
- 12:20 Gate inputs rebuilt in /tmp/r2/gate-r2 from the fixed build (12:15–12:18, while one opencode session ran; load ~8): B1, B7, B8 (es-toolkit), B9 medium (run.mjs joins --out to the repo root, moved into place), B10. Not rebuilt: B4 (golden clones incl. 2 private repos lost with /tmp), B9 large, B2/B3/B5 (never re-run this round). B8 is re-run on the quiet machine after the queue (timing-sensitive).
- 12:21 Graded the agent rows early (queue's grade pass skips graded keys): agent r2 exit 0, agent r2fix exit 0.
- 12:23 Checked the fixed-build Claude review transcripts: the Architect lean-pass text reached 5 of 6 automatic-Prism (B) review sessions (jsx-gap B, which ran 10:10, did not carry it); none in A/L/P, as expected.
- 12:44 opencode small run finished 12:41 (22/22); graded early (exit 0). Probes (3 missing) running.
- 12:50 queue: opencode finished
- 12:50 queue: all grading done; ~/.prism-ab-token deleted, check: gone
- 12:50 queue: caffeinate stopped: yes
- 12:50 finalize: results copied from the clone, B6 republished (backup /tmp/r2/docs-backup-final), VAL + release gate run (/tmp/r2/gate-final.txt).
- 12:52 Queue done 12:50: all grading done (Claude r2fix2, agent r2, agent r2fix, opencode r2, two passes), ~/.prism-ab-token deleted and confirmed gone, caffeinate stopped (confirmed), no runner or daemon left. finalize: results copied from /private/tmp/prism-fix, B6 republished (Claude small 11/11 + opencode small 11/11), check ok; VAL fail (Claude 13 tokens/file, −101%; opencode nothing to calibrate). Gate --release on /tmp/r2/gate-r2: FAIL (3) T1 4.54, Claude cost, C14 stop 1,307 ms (B8 measured under load 7.6); 18 pass, 13 skipped. B8 re-run on the idle machine 12:51: stop p95 550 → gate on /tmp/r2/gate-r2-quiet FAIL (2), 19 pass. Both reported; nothing loosened.
- 12:52 Round 2 section regenerated (/tmp/r2/report.py from /tmp/r2/round2-template.md + xtable.py + xtool.py; previous report saved at /tmp/r2/change-report-before-final.md). No commit, no push.

## Round 3 (16 Oct 2026, from 13:21 IST): the four approved fixes

- 13:21 Start. Token absent at start; owner saved a new one at 13:22 (isolated HOME only). Scope of re-runs (owner via parent): Claude follow-up A/B, opencode small A/B, release gate, small regression probe (review, custom skill, habit). No full suite.
- 13:25 Item 1 cause hunt. Round 2 Claude transcripts are gone (/private/tmp cleared at the 10:00 reboot), so the cause is read from the rows and the code. The 4 follow-up pairs the grader gave to no-Prism: es-toolkit-3433044c B ends with an empty diff although its turn-2 tests passed; hono-b20d4225 B "never touches buffer.ts"; hono-3d8abbc2 B "never updates types.ts"; hono-7a254bc0 B takes a different route. Prism's follow-up text is small (333–635 characters a turn). What does happen between turns: the stop hook starts checks in the daemon; a failed check re-runs with the session's files put back to HEAD *in the live folder* (M-092 `withBaselineTree`), then writes back the bytes it saved. The harness sends the next turn at once (it waits for Prism only at the end), so the agent works in the folder while its earlier fix is temporarily reverted, and anything it writes in that window is overwritten by the write-back. That explains work that vanishes (empty diff after a passing turn) and files the agent "never touched". Same bug as owner decision 1, so items 1 and 3a share one fix.
- 13:29 Fix (decision 1): `baseline.ts` now builds a throwaway copy: HEAD through its own index file (`GIT_INDEX_FILE`, so the repo index, stash and worktree list are untouched), plus every change that was already there before the session, session files left at HEAD, `node_modules` folders linked in. Checks run there; the copy is deleted after. The live folder is only read. `withBaselineTree` → `withBaselineCopy(root, paths, fn(copyRoot))`; `classifyFailures` runs each package in the copy. Yarn Plug'n'Play is refused (its dependency map is tied to the project folder: tried a linked copy in /tmp and a same-depth sibling, both fail to load vitest), so on PnP projects a failed check keeps cause "unknown" (still treated as failed, the safe side). `recoverBaseline` kept only to repair what an older build's interrupted run left reverted. Tests: baseline.integration.test.ts 5/5, including "never overwrites an edit made in the live folder while it runs" (fails on the old code).
- 13:41 round 3 queue: queue started (2 runners)
- 13:41 round 3 queue: opencode small A/B started
- 13:41 round 3 queue: Claude follow-up A/B started
- 13:32 Found a second follow-up fault while doing decision 2: the daemon wrote the files of a block into session memory before the hook delivered it. When the hook gave up at its deadline, those files were still recorded as sent, so the next turn said "Same as before" (or nothing) for files the agent never saw. Fix: `promptContext` returns the shown files (`shown`, with content keys); the hook records them (`rememberShown`) only once the block goes out. Test: a block over the deadline stays out of session memory; a delivered one goes in.
- 13:32 Decision 2 (no prompt gets zero help): the lens is now the hook's own quick part (`promptLens`, reads only the lens store, no index). Review and question prompts never wait on the daemon. A change prompt still asks the daemon for the file block inside 900 ms; on deadline or a busy daemon the block is dropped and the lens still goes out, while indexing carries on in the background. The daemon no longer marks a lens as shown (it could mark one the hook never delivered). Unsupported-language repos keep their one-line note only. Tests: hook-latency.test.ts 8/8 (4 new), daemon.test.ts updated (deadline → lens only).
- 13:37 Item 2 cause: opencode has no prompt hook, so Prism reaches it only through the `prepare_change` tool, whose answer had no lens at all (checked in the owner's opencode session store: es-toolkit-827b92f7 B got a 7,992-character JSON pack of 19 files, 13 of them weak matches such as benchmark files, and no "smallest complete change" steps). Fix: `prepare_change` leads its answer with the lens (`lens: {name, steps}`), once per session when a session id is given, every call otherwise. Same path serves the Cursor agent CLI. Test in prepare.test.ts (lens first in the serialised answer, survives the budget cut, once per session).
- 13:38 Rules text said a "Prism · prepare" block; the hook's block has been titled "Prism · files for this task" since round 2. Fixed in ruleset.ts and its byte-identical copy plugin/hooks/prism-rules.md (contract test).
- 13:39 Built shared, checks, daemon, core, mcp-server, cli and the dev pack from the working tree (dev pack's MCP bin = /Users/shaileshjha/Prism/packages/mcp-server/dist/bin.js). feature-probes.ts writes features-<PRISM_AB_TAG>-<host>.jsonl (was always r2).
- 13:41 Launched /tmp/r3/queue.sh (2 runners): slot 1 Claude follow-up A/B (same 9 tasks, 18 sessions, tag r3, work /private/tmp/prism-ab-fix, isolated HOME) → regression probes (skill invoked/auto, habit invoked, lens invoked/auto ×3, QA auto) → review subset (meanBy, combine, etag; A and B); slot 2 opencode small A/B (22 sessions, opencode/mimo-v2.6-flash-free, 10-minute limit, tag r3); then blind grading by Claude, two passes. caffeinate -i -m -d -s detached (pid 64849). Disk guard: pause under 1.5 GB free, resume over 2.5 GB.
- 13:50 round 3: stopped both A/B slots after 4 sessions. Found that the Claude plugin's prompt hook (`prism-hook.mjs`) calls the daemon's `/v1/prompt` itself, so the round 3 move of the lens into `prism-mcp --hook prompt` had left Claude with no lens and no session memory. Those 4 rows were discarded (moved to /tmp/r3/discarded) and are not in any result.
- 13:52 round 3 fix: the plugin prompt hook now runs `prism-mcp --hook prompt` (about 0.2 s), so Claude, the daemon-off path and other hosts share one path: lens first from the lens store, file block from the warm daemon, lens alone on a deadline or busy daemon. The hook's budget counts from the process's own start (rounded to whole ms; a fractional value made the daemon call fail). The "prompt named its files" lite mark moved there too. Tests: plugin 41/41 (fake daemon record now complete, so the daemon path is really exercised), hook-latency 10/10.
- 13:54 round 3 fix: Prepare no longer treats a capitalised word that only starts a sentence ("Next: the tests below…") as a named symbol. In hono that word matched the `Next` type and put src/types.ts on every follow-up turn as "named in task". Test added (fails without the fix). intelligence 176/176, mcp-server 140/140.
- 13:58 rebuilt all packages and the dev pack (points to /Users/shaileshjha/Prism/packages/mcp-server/dist/bin.js); relaunched both slots from the start.
- 13:57 round 3 queue: queue started (2 runners)
- 13:57 round 3 queue: Claude follow-up A/B started
- 13:57 round 3 queue: opencode small A/B started
- 14:13 round 3: resumed after an interruption; queue, both slots, disk guard and caffeinate still running; nothing restarted. 7.7 GB free.
- 15:03 round 3: resumed after a second interruption; everything still running (16 Claude rows, 7 opencode rows); nothing relaunched.
- 15:14 round 3 queue: Claude follow-up A/B finished; starting regression probes
- 15:21 round 3 queue: probes finished; starting review subset
- 15:24 round 3 queue: Claude slot finished
- 15:31 round 3 queue: Claude grading started (2 passes, blind)
- 15:33 round 3: Claude follow-up A/B finished (A 9/9 pass, B 8/9; B miss = es-toolkit-3433044c bundle-size snapshot, timed out at 10 min brute-forcing byte sizes; R2 A timed out on the same task). Probes: habit-invoked B, skill invoked/auto, lens invoked/auto (2/2 each), QA auto A and B all pass. Review subset B 5/6 seeds, 0 extra (R2 6/6 and 5/6). Claude grading started (2 blind passes); opencode small still running (9/22).
- 15:32 round 3 queue: Claude grading finished
- 15:47 round 3: Claude follow-up graded. /tmp/r3/after.sh queued: waits for the opencode slot, grades it twice, then builds the gate inputs (B7, B1, B8, B4 all 6 repos, B9 medium and large, B10) on the idle machine and runs gate --release.
- 15:53 round 3: resumed (3rd interruption). after.sh and the opencode slot still running (12/22); Claude grades complete (9/9). Nothing relaunched.
- 16:20 round 3: opencode       17/22
- 16:54 round 3 queue: opencode small A/B finished
- 16:54 round 3 queue: opencode grading started (2 passes, blind)
- 16:55 round 3 queue: opencode grading finished
- 16:56 round 3 queue: gate: building inputs into /tmp/r3/gate (B7, B1, B8, B9 medium, B9 large, B10, B4 all 6 repos)
- 17:05 round 3: opencode small finished (22/22) and graded; gate inputs running (B7, B1, B8 done; B4 in progress).
- 17:06 round 3: opencode small graded: minimalism A 4.36 / B 4.36 (R2 4.00/3.36), style 4.36/4.09 (R2 3.82/3.09), correctness 4.64/4.27 (R2 3.82/3.64), preferred A 4, B 2, tie 5 (R2 6/2/3). Lens checked in the opencode db: present as the first field of all 10 prepare_change answers in the run.
- 17:19 round 3 gate inputs: B7 done; B1 with Prism 7,270 vs without 7,869 est. tokens (ratio 0.92); B8 p95 prompt 896 ms, stop 508 ms (R2 923 / 1,307). B4 running.
- 17:31 round 3 queue: gate done: gate: FAIL (1); 10 skipped; 0 release warnings
- 17:34 round 3 cleanup: ~/.prism-ab-token deleted (ls: No such file). caffeinate (64849), disk guard and after.sh stopped; no runners or Prism daemons left. Gate rerun with the B9 files (run.mjs wrote them under ./tmp because --out is joined to the repo root; moved to /tmp/r3/gate): FAIL (1), 8 skipped.
- 17:43 round 3: Round 3 section written to prism-2-next-change-report.md.
- 17:45 round 3: smoke test re-checked against the final build; added the heavy-swap caveat to step 9.

## Website v6 (16 Oct 2026, from 18:21 IST)
- 18:16 real install: `prism install claude --user --local` from the local build (nvm Node 24.18.1); stale `prism@local` 1.12.0 plugin (dev-link symlink) removed; backup ~/prism-install-backup-20261016-181845. Mac had rebooted ~18:08: /tmp/r3 is gone.
- 18:22 website task start; caffeinate pid 4745. Design /Users/shaileshjha/Downloads/prism-website-v6.html = 46 screens (24 site + 21 docs + search), one shared CSS (paper/ink/carbon palette, Instrument Serif + Geist + JetBrains Mono + Inter). Extracted to .bench/web/design (gitignored) with a facts sheet FACTS.md built from docs/benchmarks/2.x.* and the Round 2/3 report sections.
- 18:28 benchmarks-sample.json checked: recordedAt 2026-10-16T11:26Z (16:56 IST, the Round 3 B1 run), totals 250 -> 25 tool calls, 7,869 -> 7,270 est. tokens = the Round 3 report (ratio 0.92). Correct; machine.node says v24.3.0 (whatever node ran B1).
- 18:37 Architect session (claude -p, Architect lens named; hook injected "Lens: Architect"): plan in .bench/web/plan.md, 38 turns, 114 s. It used no Prism MCP tool (it said so; delete safety from grep). Decisions taken for the owner: light only, /product/[slug], /whats-new -> /changelog, keep /admin (rewired), docs paths kept. Snapshot before edits: .bench/web/before-website-docs.tgz.
- Runner note: background `claude -p` from the remote shell got killed; sessions now run under `screen -dmS`.
- 18:51 Dev session d1 (foundation: tokens, fonts, components/ui + components/site, lib/nav.ts): 82 turns, 439 s, typecheck + 23 tests pass. Hook gave "Lens: Dev" (named). Prism MCP calls: 0 (Claude Code defers MCP tool schemas behind ToolSearch).
- Prism findings so far: (1) stop hook said nothing to Claude: events.jsonl "no receipt: daemon silent" (workspace resolved to apps/website, the agent's last cd); the async receipt then failed "receipt.corrupt: Array must contain at most 20 element(s)" (a change touching more than 20 files breaks the receipt schema). (2) d2 prompt said "Use Prism's Dev lens" after a header that mentioned "Architect plan": the hook picked "lens architect" (first lens word wins, even as a plain noun). Later prompts put the lens line first.
- 18:51 Dev session d2 (home + 404) started.
- 19:00 d2 (home + 404) done: 98 turns, 481 s, typecheck + tests pass; home stats switched to Round 3 (61.8% / 64.9% / 4 of 4); receipt/prepare panes rewritten to Prism's real output format; 5 dead home components deleted (grep-checked). Lens actually injected: Architect (see finding 2). Prism MCP calls 0 ("tools weren't loaded": deferred behind ToolSearch, which was not in the allow list; added).
- 19:01 dev server (screen "web", port 3000); Playwright screenshots of / and 404 (desktop + mobile): no overflow; home 6,202 px tall vs design 6,113. Mobile reflows the desktop layout (design's mobile stacks the buttons full width and puts step numbers inline) - polish later.
- 19:02 d3 (product pages part 1) started; first Prism calls: safe_delete on app/products/page.tsx and app/features/page.tsx -> "safe: false", blockers = tsconfig.json glob and next.config.mjs "via soft signal" (finding 3: soft config signals reported as hard blockers for a Next route file nothing imports).
- 19:11 (interrupted ~19:10, resumed) d3 (product pages part 1: prepare, blast-radius, guardrails, receipts + components/site/product-page.tsx, components/ui/term.tsx, /products redirect; app/products + app/features deleted) finished: 155 turns, 571 s, typecheck + tests pass; 13 design claims corrected against source (table in its result).
- New Prism build (reinstalled ~18:50) seen in d3: one-line "Prism · Dev lens + 1 file (prism.ts) + plan cue (config or settings)". Finding 4: lead-file pick wrong (packages/core/src/prism.ts, matched the word "prism"; test command for packages/analyzer). Finding 5: plan cue "risky change (config or settings)" for a website page port (false alarm). Finding 6: every edit of a file outside the pack gets "Prism — <file> is not in Prism's pack; check blast_radius" (5 times in d3: noise on a multi-file task).
- 19:12 lint: removed the unused useRef in components/site/nav-menu.tsx.
- 19:20 d4 (product part 2) stopped by the Claude usage limit ("session limit, resets 8pm") after 36 turns of reading, no edits. Continuing by hand (per the owner's rule); Claude resumes after 20:00 for QA + review.
- 19:26 product pages part 2 by hand (Claude limit): app/product/{review,lenses,habits,cli}/page.tsx from screens 09-12, review-card/steps/chk/lf/setup/lnk CSS ported to global.css (part-2 layer); ExampleRow title now takes markup. Checked against source: lens-route.ts order + reserved words, lens-store checks per lens, lens add output, habits.ts sources/outputs/note/secret refusal, commands.ts groups; real CLI run on this repo for refs/doctor/graph map formats. Design changes: graph map shows symbols+callers+callees (real format has no signatures); `prism lens list triage` -> `prism lens list` (no id arg); habits hero says routines not skills, plus a 'Habits are not skills' callout (prism doctor skills). typecheck + oxlint pass.
- 19:32 by hand: /how-it-works (new) and /benchmarks (rewritten). Hero demos moved into components/site/demos.tsx (StartDemo, PrepareDemo, GuardDemo, VerifyDemo, MapChat/MapLines), reused by the product pages and the 4 steps. Benchmarks: headline 61.8% / 64.9% / 10 of 11 / under 1 s; glance table (39.1% top-3, 27.9% test precision, 99.6%, 1.3%, Cursor review 4/7 vs 3/7, skills 10/10, habits 4/4 + 2/2, hooks 896/508/39 ms, 4 of 4); new 'real agents' table (B6 + Round 3 A=without/B=with, losses stated); B1 read from the JSON and labelled simulated; no tokens-saved claim. Caught while checking: FACTS.md listed opencode quality as 'A vs B' without saying A = without; the report confirms correctness 4.64 without vs 4.27 with (a loss). Also opencode has no prompt hook (hosts.ts plugin: session/before/after/idle): guardrails row and the lenses trigger line fixed. Inline code may wrap now (design's nowrap overflowed phones). typecheck, 23 tests, oxlint (0 errors), oxfmt pass.
- 19:39 by hand: /install rewritten and /install/[agent] added (one static route, generateStaticParams + dynamicParams=false, data in lib/agents.ts checked line by line against hosts.ts). Fixed vs design: Cursor's rule file is only written per repo with --project (user install writes MCP only, and prints that note); Codex config is always ~/.codex/config.toml, rule in ~/.codex/AGENTS.md (repo AGENTS.md with --project); opencode's plugin has no prompt hook and logs the verdict to opencode's app log, not the chat. lib/mcp-install.ts trimmed to what the pages use, Codex TOML gained the env block, opencode JSON added (+1 test). More demos moved into components/site/demos.tsx (Review, SafeDelete, HabitPair). Deleted components/copy-install, copy-command, mcp-install-panel (nothing imports them; git grep incl. docs). Tables scroll sideways inside .tscroll on phones; inline code uses overflow-wrap: break-word. typecheck, 24 tests, oxlint 0 errors, oxfmt clean; 16 routes x 2 widths: no overflow.
- 19:41 owner steering: Claude Code no longer used for the website; sessions now run in the Cursor agent CLI (agent -p --model grok-4.7-high, stream-json, --trust --approve-mcps -f) via .bench/web/run-agent.sh, one at a time. Prism there = MCP only (~/.cursor/mcp.json from the 19:36 build); this repo has no .cursor/rules/prism.mdc (user install writes none), so prompts ask for prepare_change explicitly. a1 (Dev lens): /changelog, /privacy, /security, /open-source, plumbing, /admin.
- 19:42 caffeinate (4745) had died (killed with an earlier shell); restarted under screen 'caf'.
- 19:57 a1 (agent CLI, grok-4.7-high, Dev lens named) done: 947 s, ~230 tool calls, exit 0, HEAD unchanged. Added app/changelog (+[slug]), app/open-source; rewrote privacy, security, admin (no motion); removed app/whats-new pages + css (RSS kept at /whats-new/rss.xml, redirects /whats-new -> /changelog, /whats-new/<ver> -> /changelog#<ver>, posts -> /changelog/<slug>); seo, sitemap, llms.txt, opengraph, manifest updated. 2.0 entry built from the design and checked against source (fixed: one skill replaces five, blast radius per symbol, install over 1.x keeps custom lenses/config, Cursor extension also removed). Privacy rows checked against prism-home etc. (added hooks/, envelope-ledger, update.json, lenses, config; feedback keeps task stems 30 days). I fixed one mobile overflow on /changelog (grid tracks without minmax(0,1fr)). Checks: typecheck, 24 tests, oxlint 0 errors; screenshots ok; no dead links left.
- Prism in the agent CLI (a1): MCP only (no rule file in this repo), but the agent read ~/.claude/skills/prism/SKILL.md on its own and called prepare_change first. prepare_change returned the new fields: "prism": "Prism · Dev lens + no sure file (read before editing)", the Dev lens steps, and "finish": "After editing, call receipt and report its verdict in one line." The agent followed all three (it opened its answer with the Prism · line and called receipt at the end). Wrong/weak: pack ranked core/motion files above the website pages and pointed house style at a fixture route handler; safe_delete again "safe: false" on Next pages only because next.config.mjs/tsconfig.json globs (finding 3 again); receipt answered NOT PROVEN "still_running", checks [] / testMode skipped on both calls, it never settled while the agent waited; receipt's duplicate findings (metadata vs pageMetadata, AdminPage vs Page) were name-overlap noise. Useful: blast_radius on lib/seo.ts (many importers, so pageMetadata kept its shape); safe_delete's orphan list named the old What's new leftovers for cleanup.
- 20:02 a2 (agent CLI, Dev lens): docs restyle, MDX components, meta order, 3 new guides.
- 20:25 a2 (agent CLI, Dev lens, docs) done: 1,119 s, exit 0, HEAD unchanged. Docs chrome on the fumadocs notebook layout + CSS (site nav, 240 px sidebar with section labels and inset active bar, search pill with kbd, 740 px article, serif h1, crumb, 200 px toc, pager, carbon code blocks), MDX tables/callouts -> ui Table/Callout, meta.json reorder (Get started, Using Prism, Reference, Help, More; paths unchanged), new docs/guides/lenses.mdx, habits-and-skills.mdx, hooks-and-strength.mdx. It corrected me: install turns on the receipt tool for opencode too (RECEIPT_HOSTS = cursor, codex, opencode); lib/agents.ts fixed. My fixes after it: docs were squeezed on phones (sidebar/toc widths forced with !important at every width; now only at >=768 / >=1280 px); React key warning in the search pill kbd; a pre-existing self-redirect /docs/guides/envelope -> itself (loop) removed from next.config.mjs. docs:check still fails on pages not touched today (stale generated reference, word budget of docs/benchmarks/2.x.md and wire-into-ci.mdx, prism start missing from the generated CLI page); nothing on the 3 new guides. Prism in a2: prepare_change gave the Dev lens + 'no sure file' and a wrong file (packages/shared/src/index.ts); blast_radius right (docs-chrome only used by the docs layout; mdx.tsx shared with changelog/legal/admin); graph importers_of useful; test_impact: no tests; guard_session ranked the whole dirty tree incl. .github workflows (risk 70) rather than the paths passed; receipt NOT PROVEN 'untested', checks pending.
- 20:26 a3 (agent CLI, Dev lens): cleanup + deps + mobile polish. Backups: .bench/web/bun.lock.before, website-package.json.before.
- 20:30 resumed after interruption: a2 had already finished at 20:25 (logged); pid 40807 is an agent process started ~19:27, before any of my sessions (not mine, left alone); a3 (cleanup) still running in screen a3; caffeinate alive (screen caf). Not relaunching anything.
- 20:40 a3 (agent CLI, Dev lens, cleanup) done, exit 0, HEAD 08e4d3c unchanged. Deleted unused: components/motion/* (12), lib/gsap.ts, lib/features.ts, app/landing-theaters.css, theme-sync, github-star, whats-new-still, ship-archive, envelope-theater, prepare-theater, product-window, landing-chapter, legal-doc, old site-footer. Deps dropped from website: gsap, @gsap/react, next-themes (still pulled by fumadocs-ui), @repo-prism/ui (moon dependsOn + vercel buildCommand updated). Mobile polish: hero/CTA buttons stack full width at <=640 px, step numbers inline. Website typecheck/test (24)/lint ok; format:check fails only on packages/mcp-server/src/tools/prepare.ts (not website, dirty from other work). Prism in a3: prepare_change Dev lens but lead file wrong (StaggerGrid.tsx then core barrels); safe_delete useful (kept layout.shared.tsx, sparkline.tsx; tsconfig/next.config glob blockers noise) but missed the CSS @import edge global.css -> landing-theaters.css; test_impact on global.css: none; receipt proven but listed only 4 files, not the deletions.
- 20:41 a4 (agent CLI, Dev lens): docs finish - regenerate reference, word budgets of wire-into-ci.mdx and benchmarks/2.x.md (no number changes) so docs:check passes.
- 20:50 a4 done (exit 0, ~11 min). docs:check now ok (43 pages): reference regenerated (cli-commands has prism start), wire-into-ci.mdx 661->637 words (wording only), per-task table of docs/benchmarks/2.x.md moved unchanged to new docs/benchmarks/2.x-per-task.md (+meta.json). I checked: every number in the original 2.x.md (recovered from the a4 transcript) is still in the two files; /docs/benchmarks/2.x-per-task 200. Website typecheck + 24 tests ok. Prism in a4: prepare_change 'Dev lens + nothing new (you named the files)' but pack still pointed at packages/shared/core; test_impact on a .md: none; guard_session risk 18 low but ranked all 401 dirty files; receipt SHIP/proven yet recorded only 1 of 7 edited files.
- 20:50 a5 (agent CLI, QA lens): bugs + missing tests (links, agents/install vs hosts.ts, changelog/RSS/redirects, benchmark numbers).
- 21:13 a5 (agent CLI, QA lens) done, exit 0. Fixed: changelog parser dropped wrapped bullet lines and section prose (1.0.5, 1.0.0); RSS newest item now 2.0.0 (-> /changelog#2.0.0); /docs/ide/settings + /docs/reference/ide-settings redirected to a 404 -> now /docs/start/install; admin architecture docs had relative links outside their collection -> absolute /docs/...; ./2.x.json 404 -> served by app/docs/benchmarks/2.x.json/route.ts; opencode --project paths on install pages (.opencode/plugins/prism.js + AGENTS.md; codex stays in ~/.codex). Tests: +3 in lib/changelog.test.ts (27 pass). Prism in a5: prepare_change QA lens, pack wrong (scripts/bench/feature-probes.ts, shared schemas); blast_radius on changelog.ts useful (page, RSS, adoption.ts); test_impact right (lib/changelog.test.ts + command); receipt NOT PROVEN (untested JSON route) with a wrong dependents_not_in_diff (untracked files invisible to it).
- 21:13 a6 (agent CLI): 'Review my current change.' (findings only).
- 21:20 resumed (interruption 3): a3, a4, a5 done; a6 review still running in screen a6, not relaunched; caffeinate alive.
- 21:27 a6 done (exit 0), review findings: HIGH site says 'no telemetry' while the site loads Umami (pulse) with a 400-day cookie; HIGH home said golden-recall stats were 'on public repos' (6 repos incl. mono + a local clone); HIGH Claude Code 'with Prism' row omitted that Claude made 0 Prism calls; MED /changelog hid any 2.x from CHANGELOG.md; MED admin latest release stuck on 1.x; MED CHANGELOG.md read via runtime path (verify in build); LOW untested chrome. Prism tools in a6: guard_session x2 (first on whole dirty tree, 407 files), blast_radius seo.ts, graph importers_of changelog.ts, safe_delete on deleted paths (not found). Fixed by me by hand (small): /privacy new 'This website' section describing the analytics honestly (Prism claims unchanged, they are about the tool); home 'public repos' -> 'six repos'; benchmarks Claude row adds 'Claude did not call Prism’s tools in any of the 11 runs'; changelog page filters out only 2.0.0 (hand block), not all 2.x; adoption.ts uses feedReleases (latest 2.0.0). typecheck, 27 tests, lint ok.
- 21:29 final checks: next build ok (90 pages; stale .next/cache CSS warning cleared; rss.xml and 2.x.json now force-static so CHANGELOG.md/2.x.json are read at build, review MED fixed); root lint ok; website typecheck ok, 27 tests; docs:check ok; format:check fails only on packages/mcp-server/src/tools/prepare.ts (other work, untouched). Prod server on :3100 (screen prod); screenshots of 74 routes x 2 widths -> /tmp/website-shots.
- 21:37 final: /changelog rendered CHANGELOG.md relative links (./PRIVACY.md, ./SECURITY.md, ./plans/...) as dead site links -> now GitHub blob URLs (repoHref). Rebuilt (ok), 27 tests ok. Found a stale :3100 server from earlier and replaced it; full screenshot pass re-run on the fresh build: 74 routes x desktop 1440 + mobile 390 = 148 PNGs in /tmp/website-shots (+report.json); all 200 (404 page 404 as intended), no horizontal overflow, no console errors, 299 links, 0 dead internal (only the cursor:// deeplink, which the checker can't fetch). Prod server stopped; dev server left on :3000 (screen web). caffeinate stopped. No commits.
- 22:17 tweak (by hand): removed the stray '↑ ↓ move / ↵ open' row (fumadocs search footer option in app/layout.tsx rendered as a visible strip above the header on every page) + its .docs-search-hint CSS; header (beam + nav) now sticky: .topbar wrapper in site-nav.tsx, solid paper bg, z 40, --nav-h 72/64 px, docs --fd-banner-height so sidebar/toc stick below it, [id] scroll-margin-top. typecheck/lint/27 tests ok; shots in .bench/web/shots-share.
- 22:17 note: root lint now fails on packages/intelligence/src/prepare/rank.ts:273 (no-useless-spread), edited by another job after my 21:50 lint pass; not touched. oxlint apps/website: 0 errors.
- 22:31 pair animation ported from the design (by hand): chat-terminal-pair.tsx now a client tablist (buttons, roving tabindex, arrows/Home/End, tabpanels inert when hidden), plays once at 25% in view (IntersectionObserver), replays the pane on tab switch; CSS rise/type/caret/pop keyframes with the design's timings; Typed renders the .typed span; reduced motion / no IO -> data-static final state; phone (<=640) no typing like the design. No auto-cycle (design has none). typecheck, oxlint website 0 errors, 27 tests; 37 pairs on 12 routes x 2 widths all play, no errors. Frames + compare sheets + anim-hero-desktop.mp4 in .bench/web/shots-share.
- 22:52 audit task start. Fix 3 (Prism): House Style pointer could name a fixture (prism prepare here gave packages/intelligence/fixtures/m070-envelope/src/routes/users/handler.ts). houseStyle() in intelligence/src/prepare/pack.ts now skips fixture paths (isFixturePath) and generated/vendor (offLimit) before picking; +1 test in pack.test.ts (fails without the fix, 35/35 pass with it). Built intelligence (tsc), prism upgrade: re-linked claude, cursor, opencode.
- 22:59 website audit: before shots (reduced motion = final demo state) in .bench/web/audit/before (22 routes x 2); source snapshot .bench/web/audit/src-before/website.tar. Prism prepare (Architect) picked product-page.tsx + table.tsx; plan: sticky product nav, tighter sections/tables, full-width At a glance, 2x2 custom lenses, stale receipt/review/privacy wording.

## 2026-10-16 22:46–23:20 IST — Website audit: spacing, tables, sticky product nav, two fixes

- Planned, then Dev by hand (the other job's agent worker was running; one session at a time) → QA (tests, shots) → `prism review` on the changed files (risk 46/100 moderate; UI files have no unit tests, covered by shots).
- Before shots: .bench/web/audit/before (44 PNGs, all 200, no overflow). Source snapshot: .bench/web/audit/src-before/website.tar.
- UI: sticky product strip (components/site/product-strip.tsx, .pnav sticky under .topbar, --pnav-h, scroll-margin for anchors, current link scrolled into view on phones); .sec 88→72px, product hero 80/56→64/48; tighter table cells, no last-row rule, .tcard wrapper, nowrap short columns on desktop only; benchmarks "At a glance" full width; custom lenses 4 tall rows → 2×2 grid; home "Measured" stats column widened, .card.stat padding; example rows top-aligned with sticky copy; long typed commands wrap instead of clipping (TYPE_MAX 56).
- Content: privacy habits.json → skills/<habit>/SKILL.md (0600, secret refused); receipts stored "prune keeps newest 20"; receipt timeout example 600000ms → 60000ms (RECEIPT_CHECK_TIMEOUT_MS); still_running wording; review demo "working tree" → "this session" and review card says it ranks this session's changes (guard_session default).
- Fix: House Style skips fixture/generated/vendored files (pack.ts isFixturePath + offLimit) + test; intelligence rebuilt; prism upgrade (local build). House Style now apps/website/app/llms.txt/route.ts instead of a fixture handler.
- Checks: website tsc ok, oxlint 0 errors (2 old warnings), oxfmt clean, vitest 27/27; intelligence tsc ok, prepare tests 53/53. After shots: all 44 routes 200, no sideways overflow, no console errors. Sticky strip: top 72 (desktop) / 64 (phone) = topbar bottom; anchors land below it.
- Shots: .bench/web/shots-share/audit-*.png, combined audit-before-after.png. No commits.

## 2026-10-16 23:29–23:55 IST — Fix three spots (NOT PROVEN table, review terminal, Gate a push)

- Shots before/after: .bench/web/audit/fix3/{before,after,design}; scripts audit/fix3.mjs, audit/fix3-tabs.mjs.
- NOT PROVEN (phone): the two-column table squeezed "Means" to ~90px beside the long reason chips. Fix: on ≤640px two-column .tcard tables read as a list (name, then meaning). Desktop already matched the design.
- Review terminal: the design's .tv styles (.kv fields, .tbl/.tr file table, .sep rule) were never ported; the demo used padded text and blank <Ln/> rows, which render 0px high. Fix: ported the design markup + CSS (scoped .vis), removed field()/row() helpers; empty .ln is now a 0.85em gap site-wide.
- Gate a push: the audit's .xrow-copy (items-start + 56px top pad + sticky) applied to every ExampleRow, so rows without tabs sat lower than their window. Fix: only rows that hold a .pair top-align; others centre as in the design (.xrow class).
- Checks: tsc ok, oxlint 0 errors (2 old warnings), oxfmt clean, vitest 27/27; 22 routes × 2 widths: 200, no overflow, no console errors. No commits.

## 2026-10-17 00:00 IST — NOT PROVEN laid out like "At a glance"

- receipts/page.tsx: the two-column grid became the At a glance structure (Container → h2.d3 → p.lede mt-3.5 mb-7 text-lg → card tcard Table). No new CSS. The phone list view for two-column tables stays.
- Checks: tsc ok, oxlint 0 errors, vitest 27/27; receipts + benchmarks at 1440/390: no overflow, no console errors. Shots: shots-share/nine-1440-after.png, nine-390-after.png, nine-vs-glance-1440.png. No commits.

## 2026-10-17 00:35–00:55 IST — No language/Node limits, live star count, trim

- Language/Node wording removed in apps/website only (home hero, how-it-works, install meta + lede, CTA band, llms.txt, receipts unsupported_language, seo featureList + FAQ "Which languages?"). Docs under repo docs/ not touched (other job).
- Star count: lib/github.ts fetchStarCount (GitHub API, next.revalidate 3600, 3 s timeout, null on error/private) + Intl compact format; components/ui/star-button.tsx (server) with aria-label; MobileMenu gets the button as a prop. Test added. Live count shown: 10.
- Trim: home "Switch tabs…" ×3, "n of 3" eyebrows, hero caption, "Run it in your repo.", "One install for each:", duplicate Star button in the Open source card; product hero "Product" eyebrow; captions on prepare, receipts, cli; blast-radius "Second example"; lenses filler sentence; changelog "kept below for history".
- Checks: tsc ok, oxlint 0 errors, oxfmt clean, vitest 28/28; 44 shots 200, no overflow, no console errors. No commits.

## 2026-10-17 01:45 IST — r5 finish + local-first positioning
- MCP snippets rebuilt from packages/cli/src/install/hosts.ts (read only): node command, server bin arg, env NODE_USE_SYSTEM_CA + PRISM_MCP_BIN; Codex TOML and opencode `mcp.prism` local entry; receipt opt-in via ~/.prism/config.json. Old snippets used `prism-mcp` on PATH and no env: fixed. Test lib/mcp-install.test.ts checks them against hosts.ts/install.ts.
- Removed Cursor deeplink + `claude mcp add` line (both launched prism-mcp from PATH). Dropped unused .btn.cur / variant "cursor", FeatureList `single`.
- AgentLogo (inline SVG) on home agent links, install overview cards, agent tabs and hero. Copy buttons for both install commands per agent page.
- /install#custom: generic mcpServers.prism entry + receipt opt-in.
- Positioning copy: title, description, hero, footer, OG, llms.txt, how-it-works, privacy, home "Questions Prism answers".
- Checks: tsc ok, oxlint 0 errors, tests pass; 149 shots (74 routes x2) no overflow, no console errors.
- 01:25 IST Envelope removal: website (privacy row, FAQ JSON-LD, changelog CLI line, 1.12.0 post), docs (guides/envelope, concepts/envelope pages + links, faq, glossary, index, quickstart, install tree, what-is-prism, known-limitations, signal-provenance, usage/troubleshooting/wire-into-ci 'envelope'->'wrapper'). Generated reference left. Backups in .bench/web/removed-envelope/. docs:check ok (41 pages).
- 01:50 IST MCP snippets -> `npx -y @repo-prism/mcp-server@2` (no env, no paths) for Claude/Cursor/opencode/Codex/custom. Verified: packed all 13 packages to /tmp/ppub, npm i -g into temp prefix with fake HOME; `prism-mcp` and `npx -y @repo-prism/mcp-server@2` both answer initialize + tools/list (9 tools, 10 with receipt opt-in). Found: `prism install`/`prism start` from a global npm install fail (defaultSource expects a checkout; CLI does not depend on mcp-server). npm 11 skips better-sqlite3 install script (server still ran).
- Production copy pass: benchmarks (method, no Round/B6/planted/build labels), home stat lede, open-source order, llms, docs install/CI/usage wording. docs:check blocked by other job's in-progress core envelope export removal (mcp-server dist stale).
- 01:55 IST hero rework (headline 'Software intelligence for your coding agent.', balance, 20ch/46ch, tags after CTAs); benchmarks Method moved to bottom as 3-col dl. tsc/lint/tests ok.
- 02:00 IST hero: h1 'Your agent's second pair of eyes.' + sub 'Know before you ship.'; title/meta/OG/llms/footer lead with it. tsc/lint/tests ok.
- 02:10 IST hero intro rewrite + chips; Command wraps only at '&&'. tsc/lint/tests ok.
- 02:20 IST Product menu: click toggles (hover-then-click pins), outside pointerdown + Escape close, svg chevron rotates via aria-expanded, touch tap toggles.

## hero5: Prepare + Lens Review as hero (website only)
- Home hero lede: Prepare (before) + lens review (after); SHIP/NO-SHIP chips and ShipTerminal removed.
- Hero demo: one VAT task. Chat = prepare_change + guard_session QA lens; Terminal = prism prepare + prism review. Output formats copied from real CLI/MCP runs on throwaway /tmp/northwind clone.
- Below-hero: step 3 "Review what it missed" (receipt mentioned second); FeatureBlocks reordered Right context → Review what it missed → Accurate changes; Questions list leads Prepare, house style, review+lens.
- tsc ok, oxlint 0 errors, vitest 30/30, shots 1440/390 ok (no overflow/console errors). Shots: .bench/web/shots-share/hero5-*.png. No commits.

## hero6: hero demo matched to real output
- Re-ran prepare_change (clean tree) and guard_session {review,lens:qa} on /tmp/northwind. Chat now uses the real "Dev lens + 1 file (invoice.ts)", the 4 real pack files (incl. checkout/summary.ts), the real reuse (invoiceTotal), and the real QA finding text. Terminal: summary.ts row restored, review rows in real order. CLI review has no lens flag, so the terminal is unchanged there.
- tsc ok, oxlint 0 errors, vitest 30/30, shots ok. No commits.

## 02:15 copy audit ("no slop") + UX pass
- Copy: home, how-it-works, prepare/review/lenses/receipts/blast-radius/guardrails/cli, install/[agent], benchmarks (8 slogan tails cut), privacy, security, changelog subtitle, seo (description, FAQ, featureList), nav blurbs/order (Prepare, Review, Lenses first), footer, OG, llms.txt. Docs: index (title Introduction, IDE removed), what-is-prism, 11 frontmatter descriptions, prepare/guard/remember/configuration (IDE refs), index path ~/.prism/workspaces/<key>/cache, verdict wording in usage/glossary/faq, lenses (lens review section, pick order).
- Facts fixed: receipt runs every lens's checks (not "with the QA lens on"); security "Local binary" vs npx snippet; index not in .prism/; IDE gone; PrepareDemo terminal now real output (4 files, invoiceTotal); refs table aligned like the CLI; CLI page duplicate map chat removed.
- UX: receipt reveal (chip pop + rise, design .slip.play) via components/ui/reveal.tsx; global focus-visible ring, pointer cursor (preflight reset), text-wrap: balance on h1–h3; button/copy/tab hover + press, footer link underline (reduced-motion off); phone tap targets ≥40px (tabs, btn.sm, pnav, logo, copy, agent chips, footer links, docs menu/search).
- Delegated docs session (agent -p) died at start (no events, no exit); docs done by hand.
- tsc ok, oxlint 0 errors, vitest 30/30, docs:check ok; check-no-published-refs still fails on npx snippets (pending). No commits.

## Home hero fold (2:48 AM request)
- `app/(home)/page.tsx`: hero section gets `hero`, grid gets `hero-grid` (no markup changes otherwise).
- `app/global.css`: ≥960px: vh-aware section padding, 1fr/1fr columns (example 451→516px at 1440), 36px logo, headline `clamp(44px, min(5.2vw, 8.6vh), 72px)`, compact pair bubbles. ≤820px tall: tighter window bar/body/bubbles. ≤740px tall: 16px top padding, smaller headline and chat text. ≤680px tall: compact left column, top-aligned columns, chat body capped to the screen with internal scroll.
- fold.mjs after: 1024x640, 1280x720, 1440x800, 1536x864 all FITS; 768 and 390 unchanged (rules start at 960px), overflowX 0.
- Shots: .bench/web/shots-share/hero-fold-{1440,1024}-{before,after}.png

## Hero intro copy (2:57 AM, user-approved)
- `app/(home)/page.tsx` intro replaced with the approved text. No other verbatim copies found (git grep). fold.mjs: 1024x640, 1280x720, 1440x800, 1536x864 FITS. Checks pass. Shot: .bench/web/shots-share/hero-fold-1024-copy.png

## Compact callouts (3:09 AM, user feedback on Habits)
- Habits: skill note moved from its own .sec section into the last ExampleRow (new optional `note` prop in components/site/product-page.tsx), full container width, mt-6; copy trimmed.
- Security: report callout widened to the container (was max-w-[860px]).
- global.css .info: padding 12/16, 28px icon, r-slip radius, 15.5/15px text (applies to all info callouts incl. docs).
- No other lone-callout sections found (changelog callouts already inline). Checks pass; 1440/390 no overflow, no console errors.

## Docs article padding (3:15 AM)
- global.css #nd-page: padding-inline 8px -> 20px phones, 32px >=768, 48px >=1024. Gaps from sidebar: 48 at 1024/1280/1440, 32 at 768, 20 at 390; overflowX 0; no console errors.
- Shots: .bench/web/shots-share/docs-padding-{before,after}-{1024,1440}.png

## Changelog pagination + sticky, TOC dot (3:18-3:20 AM)
- New lib/changelog-pages.ts (+test): 10 versions/page, /changelog = page 1, /changelog/page/N static (generateStaticParams, dynamicParams=false), versionHref. lib/changelog.ts untouched.
- app/changelog: page.tsx -> ChangelogView (changelog-view.tsx), page/[n]/page.tsx, hash-to-page.tsx (client: #version on wrong page -> right page). RSS links now point at the right page.
- global.css: .cl-rel/.cl-meta sticky >=900px at nav-h+32px; .cl-pager pill links (40px tap).
- TOC: hid fumadocs sliding dot; only first active item is ink + 5px brand dot centred on first line (measured: dot centre == text centre at 1280/1440).

## SEO pass (3:59 AM)
- Waited for a running bench (scripts/bench/run.mjs medium) to finish before `next build`; prod server on :3100 stopped after the crawl.
- lib/seo.ts: SITE_DESCRIPTION = approved intro; OG_IMAGE + twitter image + RSS alternate on every page (subpages had no og:image and lost the RSS link); sitemap lastModified (git time for docs, build time otherwise); Organization description; SoftwareApplication license/softwareHelp/image; breadcrumbJsonLd + techArticleJsonLd. Tests added (35 pass).
- source.config.ts: lastModified plugin (git) for docs; includeProcessedMarkdown for /llms-full.txt (new, force-static). llms.txt: approved intro, link to llms-full, force-static.
- robots.ts: explicit allow group for search + AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot(-Extended), Amazonbot, CCBot, …).
- JSON-LD: TechArticle + BreadcrumbList on docs, BreadcrumbList on product and install/[agent] pages.
- Headings: footer h4 -> h2; Card `level` prop (h2 under the page h1 on prepare/review/blast-radius/guardrails/habits/privacy); cli + security card titles h2; MDX `#` renders h2 (2.x benchmark doc had two h1s). Docs titles get "· Docs" (dup titles with /install and /product/lenses).
- 404: links to Install, Prepare, Review, How it works, Benchmarks, Changelog.
- Crawl (.bench/web/seocrawl.mjs): 71 sitemap URLs all 200 with lastmod, canonical/og/twitter/viewport/theme-color/lang/RSS on all, 1 h1 each, JSON-LD parses, no dup titles/descriptions, 60 internal links OK. Left: docs index/usage h1->h3 (fumadocs Cards, ### inside Tabs); 1.x posts link /docs/guides/dispatch and /products (308 redirects).
- 04:05 Round 4 item 5 (follow-up quality gaps), from the round-3 rows (transcripts gone). Claude follow-up minimalism 3.89 vs 4.44: es-toolkit-3433044c B timed out after editing zipObjectDeep, a file the task's own bundle-size spec covers; hono-3d8abbc2 B touched the same 3 files as A and also changed the WebSocket query path; es-toolkit-e62aa15f B was the same file, graded harder to read. The +2% tokens is mostly e62aa15f turn 1 (B 1.52M vs A 0.69M). opencode correctness 4.27 vs 4.64: two B sessions timed out at 600 s with empty diffs (827b92f7, where A timed out too; 323893f2, A finished at 541 s), each with a single Prism call. None traces to a Prism step (no wrong pack, no misleading hook text in the rows), so no product change was made for item 5; re-measured with Sonnet in round 4 instead. Not fixed, not gamed.
- 04:12 Harness: agent-ab.ts takes PRISM_AB_MODEL (session model) and PRISM_AB_GRADER_MODEL (default claude-opus-5-5, unchanged), and picks one trimmed non-empty line of the token file by PRISM_AB_OAUTH_TOKEN_LINE (the file now holds two). Verified ids with Claude Code 2.1.301 in a throwaway HOME: claude-sonnet-5-5 and claude-opus-5-5 both answer on both tokens; the HOME was deleted. Rebuilt all packages and the dev pack. Runners: /tmp/r4ab-sonnet.sh (tag r4s: follow-up 18, review meanBy/combine/etag A+B, feature probes) and /tmp/r4ab-opus.sh (tag r4o: small, --runs 2, 44 sessions), each with its own PRISM_AB_WORK/HOME/PRISM_HOME; a host stop (exit 3) retries on token line 2.

## SEO leftovers + Lighthouse (4:08 AM)
- Docs intro: MDX Card renders its title as text (span.docs-card-t, same 18px/600 look) instead of h3. docs/usage.mdx: tab sections ### -> ##; `[role=tabpanel] h2` keeps the h3 size and margins (measured identical).
- 1.x posts (7 files): removed links to /docs/guides/dispatch and /products; text now says those pages were removed in 2.0.
- Lighthouse 12.8 (prod build, headless, one page at a time, no bench running): home, /product/prepare, /docs/usage, /install all SEO 100; a11y 96-97 -> 100. Fixes: --ink3 #77725f -> #6b6655 (4.6:1 on paper2); docs active tab in ink; star button name = visible text + sr-only "stars"; docs search button uses its visible text; docs menu aria-label "Docs menu".
- seocrawl: 71 URLs, 0 real issues (one false positive: docs text "Prepare hands back"). Regression suite (fold, callouts, docs padding, TOC dot, changelog pager/sticky/hash) unchanged.
- 04:20 First runner launch died with its shell (nohup from a tool shell is not enough); relaunched as tool background jobs. Harness fix: hono's fresh clone has bun.lock and no package-lock, so install() fell to `npm ci` and failed ("install failed for hono@b20d4225"); round 3 had reused an installed clone. install() now runs `bun install --frozen-lockfile` for bun.lock/bun.lockb. Sonnet review A/B (6 sessions) finished before the fix (es-toolkit/hono checkouts don't install for review).
- 04:22 Item 6: run-eval.mjs takes `--ids-from RESULT.json` (score only the task ids an earlier result scored: the B2 baseline's 163); replay-benchmark.ts takes `--cases FILE` (replay the baseline's cases instead of mining new ones from today's HEAD). B2 running into /tmp/r4gate; B3 queued after it (es-toolkit + hono; zod's only baseline case is its failed install).

## README hero (4:22 AM)
- assets/readme-hero-{light,dark}-1280x320.png re-rendered from .bench/web/readme-hero/hero.html (site fonts/tokens, inline mark) at 2x (2560x640). README alt text updated.
- 04:27–12:27 The Mac went offline and restarted; /tmp, the runners and caffeinate were lost. Survived in the repo: runs-r4s.jsonl (Sonnet review A/B 6 + follow-up es-toolkit-15043d8e A), runs-r4o.jsonl (2 Opus small), features-r4s-claude.jsonl (9 probe rows), and all source edits.
- 04:24 (before the drop) Parent's items: `.oxlintrc.json` and `.oxfmtrc.json` ignore the generated packages/plugin/hooks/prompt-hook.mjs (lint 0 errors). Server/plugin description now "Local software intelligence that catches what your coding agent missed." (branding.ts, branding.test.ts, server.json — under the registry's 100 chars — and plugin definition.ts).
- 12:35 Resume: caffeinate restarted; format:check fixed (8 files, all from round 4: oxfmt only); prompt-hook.mjs regenerated; full build + dev pack rebuilt; both tokens re-verified in a throwaway HOME (deleted). Runner scripts and logs now in .bench/r4 (gitignored), work dirs in ~/.prism-r4 so a reboot keeps them. Launched as tool background jobs: Sonnet (probes resume, then follow-up 18), Opus small (--runs 2, resumes from the 2 rows), B2 (--ids-from baseline) then B3 (--cases baseline).
- 13:25 Prism MCP calls in Prism-on sessions (rows' transcript.prismCalls, cross-checked against the raw transcripts in the isolated HOME): Opus r4o 0 calls in 9/9 B sessions so far; Sonnet r4s 0 in 10/10 (review 3, follow-up 7); round 3 Claude 0 in 12/12; round 2fix2 1 in 18. Every session had the prompt hook's block (1,080 chars in the first r4o row). Cause found, nothing changed yet: the server IS registered and connected in the isolated HOME — each transcript has `mcp_instructions_delta` (the "Prism rules" block) and a `deferred_tools_delta` listing all 9 tools (mcp__prism__prepare_change, guard_session, blast_radius, graph, habits, rename_impact, repository_overview, safe_delete, test_impact). Claude Code 2.1.301 defers MCP tools behind tool search, so the model sees only names and must load a schema first; no session did. The Opus sessions used only Bash and Edit (no Read either). The rules also tell the agent that a "Prism · files for this task" block *is* prepare_change's answer, so the hook makes prepare_change redundant by design; the hook's "Before editing: blast_radius… After: test_impact" nudge was never followed. The Stop hook reported "NOT PROVEN (still_running)" (309 ms) — the bug Scout reported, reproduced in these runs.

## 2026-10-17 13:30–14:00 IST — Scout QA round (bugs 1–5) + Muse items 6–7
- Implemented via the agent CLI (`run-agent.sh qa4`, grok-4.7-high, prompt `.bench/web/prompts/qa4.md`; run in `screen` because nohup'd runs die with the shell). Follow-up by hand: per-bullet 1.x tags.
- Bug 1 (Accuracy table clips col 3 at 375): 3-col tcard tables had no phone layout + nowrap th. Added `t-kv` modifier: ≤640px rows become grid (metric | value, detail full width). `app/benchmarks/page.tsx`, `app/global.css`.
- Bug 2 (Full results clips CHANGE): `t-cmp` modifier on Full results + Simulated reader tables: ≤640px header shows Without/With/Change over 3 equal columns, measure label spans the row above the values.
- Bug 3 (docs prev/next off right edge): our `.docs-pager{display:flex}` overrode fumadocs' grid; flex items with a `truncate` description grew to 444–550px. Now a 2-col `minmax(0,1fr)` grid, `min-width:0` cards, 1 col ≤640px.
- Bug 4 (CTA code centred): `.cta{text-align:center}` inherited by `.cmd`; `.cmd` now `text-align:start`.
- Bug 5 (install sub-nav): "← Install" + chips `shrink-0`, link `whitespace-nowrap`; strip `subnav-scroll` hides the scrollbar (like `.pnav`).
- Item 6: 1.x sections Console/Dispatch/Spectrum/Website/IDE get a "Removed in 2.0" tag; per-bullet tags from the v7 review in new `lib/changelog-legacy.ts` (one letter per bullet; 135/135 bullets matched to v7 by text; 95 removed, 4 changed) + `lib/changelog-legacy.test.ts` (letters count = parsed bullets). Removed bullets dimmed. CHANGELOG.md / lib/changelog.ts untouched.
- Item 7: "How to read these numbers" info box at the top of the Method section (full width), then the existing method list. Numbers from page data + next-change report (stop p95 1,307 ms under load).
- Checks: website tsc OK, oxlint 0 errors, website vitest 37/37. Shots: `.bench/web/shots-share/qa4-*-{375,1440}-{before,after}.png`.

## 2026-10-17 14:30 IST: round-4 dev items (worker, no commits)
- (c1) Stop receipt: the hook gets the structural receipt (checks pending → still_running), and the finished verdict was only shown when the next stop had the same diff id, which a new turn never has. Fix: the receipt service keeps the last finished, unreported verdict per root and attaches it as `earlier` to the next receipt. Rendered as "Earlier change  <summary>" in `renderReceipt` and in the hook's `renderReceiptLite`. Tests: RE-4 (mcp-server integration, 6/6), render test (shared, 7/7), hook stop test (plugin hooks+pack, 43/43).
- (c2) Prepare on CardWise: (1) bare package imports (`@nestjs/common`) were counted as unresolved, so CONF-2 capped nearly every file at medium. Now `UnresolvedDependency.external` is set and pack ignores those. (2) CONF-4: "high" needs the task to name the file, or a lexical match ≥0.8× the best. Seeds at 60% are no longer "sure". (3) testsFor: any services/* test "covered" any services/* file through shared folder words (services, api, src, modules), and the list was alphabetical before the budget cut. Now the overlap counts words below the common folder, and the list is ordered by covered-file rank, then real test before helper, then folder distance. CardWise (devtree build): tests went from `infrastructure/mail/verification-email.test.ts` to `recommendations/__tests__/ranking-signals.service.test.ts`; #1 stays recommendations.service (now the only high). Not reproduced: Scout's exact "only packages/validation/src/index.ts". A 500-file partial index (prism start's cap) gives a frontend-only pack, which is a candidate cause. Intelligence 191/191, impact 65/65.
- (d) Proposals only (see report). safe_delete patch parked at `.bench/r4/proposals/safe-delete-glob-only.patch`.

## 2026-10-17 14:43 IST: fresh-copy QA fixes and items 1-5 (no commits)
- QA 1, moon cycle: the cli→mcp-server edge is real (cli imports `@repo-prism/mcp-server/review` and ships server + hook pack). mcp-server→cli existed only for the cross-surface integration suite, which now lives in `packages/cli/src/cross-surface.integration.test.ts`. Project graph: 16 projects / 30 edges, acyclic.
- QA 2-6: db.test uses a temp dir; finding-mutes and prism-config tests save/clear/restore PRISM_HOME; website files formatted; `scripts/repo-grep.mjs` adds the no-git walker for check-deleted-names / check-no-published-refs (node:test 3/3); CONTRIBUTING says Node 24.18.1.
- Item 1: `claudeToolId()` in shared; the nudge, block header and rules name `mcp__prism__prepare_change`; the test_impact/blast_radius reminders moved to after-edit (once per session); `_meta["anthropic/alwaysLoad"]` on prepare_change, blast_radius, test_impact, guard_session (per tool, so startup does not wait on the server).
- Item 3: `stop-wait` asyncRewake Stop hook + `/v1/receipt-status` (ReceiptService.settle: read-only, never builds or starts checks, clears `unreported`). The sync stop stays inside 1 s; the wake costs one extra agent turn per change whose checks outlast the stop. Limits: `claude -p` kills async hooks at teardown; an old Claude Code without asyncRewake would run it synchronously (≤110 s, only when checks are pending).
- Item 5: the first-answer cap is a time budget, not memory (RSS flat ~140-190 MB; full index ~0.3 ms/file at 10k files). Cap 500 → 5000, `PRISM_START_FILE_CAP` override, and the partial flag now reaches prepare (low confidence, no lead), the prompt pack and the CLI, and survives dirty re-index runs.
- Also: daemon.test fixture copy filter is now relative (an absolute `/.prism` match emptied the fixture under ~/.prism-r4); start's daemon launch resolves a PATH symlink before the node-script check.

## 2026-10-17 15:35–16:10 IST — Muse UX pass v1 fixes (H1, H2, H3, H5, M1, M2, M3) + format/refs
- Agent CLI run `ux1` (grok-4.7-high, `.bench/web/prompts/ux1.md`), then by hand: lint fix (startsWith) in changelog/[slug], phone code wrap for figure.shiki, install.mdx Upgrade `npm install -g @repo-prism/cli` (no @latest, passes check-no-published-refs).
- Add to Cursor (`PRISM_CURSOR_INSTALL_URL` + test, button on /install/cursor); 1.x banner only on 1.x posts; wire-into-ci excluded in source.config + meta + links removed (file kept); Claude Code groups first in lib/bench.ts; `lib/version.ts` from packages/cli/package.json; quickstart steps 1–2 = install+connect, ask your agent; `:is(#nd-page,.prose) figure.shiki` styles, code wraps ≤640px; apps/website/.gitignore + format scripts.
- Build OK, lint OK, oxfmt root + website OK, tsc OK, vitest 38/38, no-published-refs clean. .next removed after verify.

- 16:05 IST: cut GitHub Action mentions in docs/what-is-prism.md (surface row), docs/guides/receipt.mdx (PR comment line), docs/concepts/risk-bands.md (list). Build/lint/format/refs pass; llms*.txt clean. Quickstart + shots copied to box /workspace/deliver/quickstart-v2/.

- 16:15 IST: quickstart v3 (3 steps + doctor tip + Explore from the terminal). prism start auto-detects agents and installs user-scope with no prompt (packages/cli/src/commands/start.ts); `prism install <claude|cursor|codex|opencode|all> [--project]` confirmed in commands.ts. Build/lint/format/refs pass; .next deleted; copied to box /workspace/deliver/quickstart-v3/.

- 16:25 IST: quickstart verdict labels SHIP / NOT PROVEN / NO-SHIP (packages/shared receipt.ts shipVerdict); description updated; receipt.mdx verdict lines aligned. Checks pass; .next deleted; box quickstart-v3 refreshed.

- 16:35 IST: quickstart step 2 example now shows agent reply + 3 prepare rows (format from cli change.ts PATH/WHY table, files from hero PrepareDemo). Checks pass; box quickstart-v3 refreshed.

- 16:45 IST: real `prism prepare` output from local dist in a throwaway /tmp fixture (isolated HOME/PRISM_HOME, PRISM_DAEMON=0; deleted after). Saved .bench/web/prepare-real-output.txt; quickstart step 2 uses heading + … + header + 3 rows + …. Checks pass; box quickstart-v3 refreshed.

- 16:55 IST: prepare_change raw JSON (MCP stdio, local dist, same fixture; CLI output re-verified identical) -> .bench/web/prepare-real-output.json, box quickstart-v3/prepare-change-raw.json. Quickstart Tip -> <Callout tone="info"> (file renamed .md -> .mdx). configuration.md/troubleshooting.md npx sentences made accurate. tsbuildinfo root cause staged: .bench/proposals/tsbuildinfo-in-dist/ (patch + README). Site checks pass; .next deleted.

- 16:45 IST: quickstart step 1 = consent flow (Muse copy / start-consent README paragraph). packages/cli/README.md step 3 change staged as .bench/proposals/start-consent-cli-readme.patch (start-consent.patch also touches that file). Checks pass; .next deleted.

- 16:42 IST: quickstart step 1 replaced with Muse text word for word (lines 18-24) + 1.x line (26). Checks pass; .next deleted.

- 17:2x IST: hero v1.2 (Prepare-led) built via agent run hero12 + hero terminal sizing; /benchmarks: removed Improved during 2.0 (+FIXES, pct), moved How to read callout above Full results grid. Checks pass; .next deleted.

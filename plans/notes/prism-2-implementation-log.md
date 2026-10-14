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

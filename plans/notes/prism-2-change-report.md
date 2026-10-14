# Prism 2.0 — change report (2026-10-14 IST)

Status: implemented locally. Nothing pushed or published. One local commit (`f45ccb7`, owner-approved). Everything after it is uncommitted.

## Gate
`gate.mjs` against `/tmp/prism2/final`: **FAIL (2 of 21 checks)**, none skipped.
- B3.catchRate 0.75 → 0.375. Most of the "catches" before were false alarms, and the stricter already-failing logic is now hiding real catches too. Needs a look.
- B5.editToVisible p95 2346 → 2985 ms (+27%, limit +15%). Measured on an 11,811-file medium fixture.

## Before / after
| Bench | Baseline | Final | Note |
|---|---|---|---|
| B1 orientation tokens | 41,931 with Prism vs 9,958 without (4.2×) | 36,230 vs 7,885 (4.6×) | Absolute −14%, but the ratio got worse; calls −80% |
| B2 Prepare top-3 / recall@pack | 17.2 / 37.5 | 36.8 / 44.2 | Test precision 13 → 22.5 |
| B3 false alarms / catch | 50% / 75% | 0% / 37.5% (3 of 8 runnable) | Catch rate failed the gate |
| B4 golden top-3 / recall@pack | 16.3 / 43.3 (172 tasks) | 38.6 / 54.1 (220 tasks) | Not like-for-like: 48 hand-labelled tasks were added |
| B5 edit→visible p95 / warm Prepare p95 | 2346 / 1956 ms | 2985 / 799 ms | Edit→visible failed the gate |
| B6 agent A/B | Claude Code, 33 runs per arm: +28.6k tokens | **PARTIAL**: opencode, 3 runs per arm, run B3 still going | See below |
| B7 change recall / question FP | 0.738 / 0.125 | 0.996 / 0.013 | Owner corpus: 0.974 / 0.043 |
| B8 hook p95 (prompt / before / after / stop) | 5711 / 295 / 289 / 10837 ms | 4225 / 268 / 266 / 2251 ms | |
| B9 budgets (medium) | — | cold 2.7 s, incremental 89 ms, RSS 1.49 GB | |
| B10 install matrix | 0 cells pass | Not re-run as a matrix. Isolated-HOME install verified for claude, opencode and codex (SMK) | The CI matrix is pending CI at release |

B6 (opencode, es-toolkit debounce task, total tokens including cache reads): A = 83k / 819k / 204k (31 / 292 / 192 s). B = 350k / 550k (216 / 356 s); B3 was incomplete at report time. Every run changed a single file. With n = 3 and this much variance, no conclusion is possible. Claude Code was skipped because it isn't logged in under the isolated HOME.

## Changes by phase
- **Phase 0:** baselines B1–B10, golden miner, classifier eval, hook-latency, `gate.mjs`. R-A1 reproduced.
- **Phase 1 (commit f45ccb7, 901 files, −203k lines):** deleted the VS Code extension, app-shell and playground (option B), plus Dispatch, consent purposes, prism-ship, npx/@latest paths, startDaemon/WARMING and graph.html. Added the event log, the no-silent-catch and deleted-names lints, `resolvePrismBin`, and contracts. GOLDEN_MONO_SHA re-pinned to f45ccb7. Golden set expanded to 220 tasks.
- **Phase 2 (engine):** type-only edges, so cycles use value edges only; EXTRACTION_VERSION 3. Fixed the tsconfig alias parse bug (silent catch); rentmaadi `dateUtils` blast went from 0 importers to 3. Symbol-level blast cut es-toolkit's debounce blast from 356 files to 38. Also RES-1…6 and the test-impact, orphans and find fixes.
- **Phases 3–5:** receipt fixes (Yarn PnP counts as installed, already-failing signature, new-folder gate, boundary only on imported packages). autoPrepare (3 s readiness wait, 1,200 budget). Module classifier shipped into the hook. Lenses are now global at `~/.prism/lenses/lenses.json` with 9 data-backed checks, overrules and the `prism lens` CLI.
- **Phase 6:** `review_changes` gains lens/format inputs, lensFindings and prDescription, plus RC-3 truncation. Added `prism envelope`, `prism doctor skills`, and a rewritten review-pr skill.
- **Phase 7:** install/uninstall/upgrade rewritten (`install/hosts.ts`, `install/wipe.ts`, automatic 1.x wipe). Install is local-build only and offline. Plugin pack builds are staged and swapped.
- **Phase 8:** lockstep 2.0.0 and engines ≥24. Added `check-lockstep` and `check-no-published-refs` to lint, `doctor --fix`, and `prism stats`. Action is v2 (PRISM_HOME in RUNNER_TEMP, auto-deepen, fork PRs skip the comment). Docs cleaned up.
- **Test isolation fix:** `prismHomeDir` now uses a temp home under test runners.
- Build, lint, typecheck, format, unit and integration tests, and docs:check: all green.
- `git diff --stat 8b46042`: 981 files, +25,987 / −204,505.

## Owner review needed
1. **48 hand-labelled golden tasks** (`*-hl-NNN`, label "hand-labelled, pending owner review"): mono 10, portpilot 21, rentmaadi 17 (private, `~/.prism-dev/golden/rentmaadi.json`).
2. **C-1 ADR approval draft:** accept the 2.0 ADRs as implemented: hard deletions with no backward compatibility, automatic 1.x wipe, local-only install, global lenses, symbol-level blast, type-only edges excluded from cycles.
3. **C-14 budget draft:** proposed changes:
   - Accept a B5 editToVisible p95 limit of ≤3.0 s on the medium fixture, or keep 2.35 s and fix it.
   - Prompt hook p95 ≤4.5 s.
   - Stop hook p95 ≤2.5 s.
   - Medium RSS ≤1.6 GB.
   - Re-baseline B4 at 220 tasks.
4. **Gate failures** (B3 catch rate, B5): decide whether to fix them or accept them before 2.0.0.
5. **Commit approval** for the uncommitted work.

## Pending CI at release
B10 install matrix (OS × host), the GitHub Action v2 run on a real PR (including fork and shallow-clone cases), and the npm publish of lockstep 2.0.0.

## Open risks
- es-toolkit specs that use `import * as x from 'es-toolkit/compat'` count as binding every export, so blast is over-approximated. Fixing it needs member-reference analysis.
- B1 token ratio is still above 1×, so Prism costs more tokens for orientation.
- B6 is underpowered and partial. Claude Code A/B has not been re-run.
- B3 catch rate dropped.
- The daemon debounce timing test is flaky under load.
- Test timeouts were raised to 30 s.

## Real-home artifacts, left untouched
- Stray folders in `~/.prism/`: 28a6657f, 8b8b132a (96 MB), d5858c50, cf3fd704, 0a2c7672.
- Modified: 21d9772f.
- Written by tests before the isolation fix: `~/.prism/events.jsonl` and `~/.prism/lenses/lenses.json`.
- Safe to delete with owner approval.

## Uncommitted
186 paths after f45ccb7 (150 modified, 36 new), covering Phases 2–8, docs and this report. Scratch data lives in `/tmp/prism2` and isn't part of the repo.

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

# Prism 2.0 next plan: final change report (P1–P24)

Final: **13:45 IST 2026-10-15**. Local checkout `/Users/shaileshjha/Prism`, on top of local commit `08e4d3c` (Prism 2.0). **No commit, push, publish or deploy.** Step log: `plans/notes/prism-2-implementation-log.md`.

## Bottom line

- 23 of 24 items are built and tested. P14 is built too: the A/B harness ran, the proof is published locally, and the release gate is wired.
- **The release gate fails, and that's the correct result.** On Claude Code, Prism used **1.45× the tokens and 1.30× the cost** (medians) with slightly lower success. B1 orientation still uses 4.6× the tokens, and opencode wasn't measured. Nothing was loosened. This blocks release.
- The cause is clear and fixable (see Root cause). The fixes are listed, but none is built yet. They need one more A/B run after they land.

## Status P1–P24

| ID | Item | Status | Residual |
|---|---|---|---|
| P1 | Compact repo map (`graph {mode:map}`) | done | es-toolkit ≤ 4k tokens, build ≤ 1.5 s not re-measured |
| P2 | Signature-only prepare | done | B2/B4 recall@pack (±1 pt) not re-run |
| P3 | `maxTokens` per tool, ranked cut | done | |
| P4 | No repeats in a session | done | impact/graph path-level dedupe; PreCompact refresh |
| P5 | Strength `full\|lite\|off` + trivial skip | done | one `prism strength <level>` command instead of three |
| P6 | Learn from real edits | done | FB-5 B4 held-out not run |
| P7 | Co-change ranking | done | B4-P7: top-3 38.2 (−0.4), test recall 65.3 (+6.0); weight tune |
| P8 | Member-level usage (`import *`) | done (unit) | NS-4/NS-5 on es-toolkit not run |
| P9 | Confidence + reasons | done | B4 high-confidence ≥ 80% not measured |
| P10 | `test_impact` run commands | done | |
| P11 | Verdict-first receipt | done | |
| P12 | `review_changes` folded into Guard | done | |
| P13 | Value line | done; **VAL failed → shows "not calibrated"** | see VAL |
| P14 | Published proof + release gate | **done; gate FAILS (release blocker)** | opencode not run |
| P15 | `habits` tool | done | |
| P16 | Compact always-on rules, cache-ordered | done | |
| P17 | Warm daemon, hooks ≤ 1 s p95 | done | measured on a small fixture; 1 s ceiling needs owner approval |
| P18 | Structured findings | done | |
| P19 | `prism start` | done | es-toolkit < 60 s not timed |
| P20 | Website and docs for 2.0 | done | full `next build` not run |
| P21 | Install matrix + Action v2 | done locally (4/4) | CI OS matrix; ACT-1 real fork PR |
| P22 | Reliable tests | done | |
| P23 | Large-repo memory | done (RSS) | time budgets over (see B9) |
| P24 | Envelope ledger cleanup | done | |

## Benchmarks: before, 2.0, now

Before = 1.x baseline at `8b46042` (`plans/notes/benchmarks/baseline`; B3 corrected and B4 re-baselined with owner approval, original 1.x values shown). 2.0 = `08e4d3c` (`/tmp/prism2/gate2`). Now = this working tree. MiB for memory.

| | Before (1.x) | 2.0 (08e4d3c) | Now | Re-run now? |
|---|---|---|---|---|
| **B1** orientation tokens, with vs without | 41,931 vs 9,958 (**4.2×**) | 36,230 vs 7,885 (**4.6×**) | 36,206 vs 7,885 (**4.6×**) | yes, 12:09 IST |
| **B2** Prepare top-3 / recall@pack | 17.2 / 37.5 (163 tasks) | 36.8 / 44.2 (190) | — | **no** (disk, time) |
| **B3** catch / false alarms / median receipt | 62.5% (orig. 75%) / 50% / 4.2 s | 62.5% / **0%** / 16.7 s (real checks) | — | **no** (needs 3 checkouts) |
| **B4** golden top-3 / recall@pack / test P–R | 16.3 / 43.3 / 14.3–58.4 (172) | 38.6 / 54.1 / 24.7–59.3 (220) | 38.2 / 53.3 / 28.4–65.3 (after P7 only) | partial: after P7, not after P2/P6/P8/P9 |
| **B5** edit→visible p95 / warm Prepare p95 | 2,346 / 1,956 ms | 2,398 / 668 ms | — | **no** |
| **B6** Claude Code A/B (tokens, B − A) | +28.6k mean, 33/arm (2026-10-11) | not re-run (opencode 3/arm partial, no conclusion) | **+42.0k median (1.45×), cost 1.30×**, 22/arm | yes, 12:09–13:27 IST |
| **B6** opencode | — | partial, inconclusive | **not run** | no (no credential) |
| **B7** change recall / question FP | 0.738 / 0.125 | 0.996 / 0.013 | 0.996 / 0.013; trivial P 1.0, R 0.875 | yes, 13:40 IST |
| **B8** hook p95 prompt / stop | 5,711 / 10,837 ms (es-toolkit) | 4,225 / 2,251 ms (es-toolkit) | **260 / 688 ms** | yes, on the small m012 fixture, not es-toolkit |
| **B9** medium RSS | 1,541 MiB | 1,485 MiB | **1,171 MiB** (limit 1,638) | yes |
| **B9** medium cold / warm / incremental | 3.1 s / 3.2 s / 82 ms | 2.7 s / 2.8 s / 89 ms | **23.4 s / 21.8 s / 22.2 s (over budget)** | yes, but Node 23.1, reps 1, cold isolated HOME |
| **B9** large (50k files) RSS / warm / incremental | — | — | 1,804 MiB (limit 3,072) / 153 s / 170 s (over 55 s / 35 s) | yes, same caveat |
| **B10** install matrix | 0 cells | not run as a matrix | **4/4** (claude, cursor, codex, opencode; macOS) | yes; CI OS matrix not run |

B9 caveat: the "now" B9 ran under Node 23.1.0, the shell default, not Node 24, with one repetition and a cold isolated HOME. The 2.0 run was Node 24.21. The warm and incremental times jumped 10×–250×, which looks like a full re-index on every run rather than a code regression in P1–P24. It needs a Node 24 re-run before anyone raises a budget.

### B6 per arm (Claude Code, `claude-opus-5-5`, 22 sessions per arm, es-toolkit + hono, 11 tasks × 2)

Tokens are transcript totals (every API call). Source: `docs/benchmarks/2.x.json`.

| | Without Prism (A) | With Prism (B) | B / A |
|---|---|---|---|
| Success | 21/22 (95%) | 20/22 (91%) | −4.5 pp (CI −18 to +9) |
| Tokens, median | 92,431 | 134,434 | 1.45× |
| Tokens, mean | 130,678 | 163,844 | 1.25× |
| Cost, median (API list price) | $0.138 | $0.179 | 1.30× |
| Cost, mean | $0.159 | $0.197 | 1.24× |
| Wall time, median / mean | 41 s / 65 s | 55 s / 79 s | |
| API calls, median | 5 | 6 | |
| Prism MCP calls | – | **0 in 22 sessions** | |
| Context injected (chars) | 7,202 | 15,216 | |

Correction: the first summary (`plans/notes/benchmark-real-agents-2x.md`, mean B 131,578) used Claude Code's `-p` usage. That under-reports one session (es-toolkit-3433044c B run 2: 42,571 reported vs 752,430 in its transcript). The table above, and the published page, use transcript totals.

Release gate (`node scripts/bench/release-gate.mjs`): **FAIL**. GATE-T1 B1 4.59 > 1.0; GATE-T2 opencode missing; GATE-T2 Claude Code tokens, cost and success all worse. GATE-T2 n ≥ 10, GATE-T3 public-only and GATE-T4 regenerable all pass.

## VAL calibration (P13 vs B6)

`scripts/bench/b6-report.mjs` fits tokens-per-file-read on 6 tasks and checks it on the 5 held-out tasks. The fit came out at **−29,149 tokens per file**, which has no physical meaning: arm B cost more, so there's no saving to estimate. The held-out error was −8%, but only because both the estimate and the measured value are negative. **Result: fail.** `WITHOUT_PRISM_TOKENS_PER_FILE` stays `null`, so the value line says `saved: not calibrated`, and `prism envelope` now says "not calibrated (the B6 real-agent A/B measured no saving)". No guess is shown.

## Root cause: why Prism isn't saving tokens

Evidence: the 3 same-task transcript pairs (`plans/notes/benchmarks/b6-sample-transcripts.md`), all 44 transcripts, and the isolated `~/.prism/events.jsonl`.

1. **The agent never calls Prism.** 0 of 22 arm-B sessions used a Prism tool. Claude Code lists MCP tools as deferred ("available via ToolSearch"), and a rule saying "call `prepare_change`" isn't enough. The agent used `cat`, `sed`, `grep` and `git show` exactly like arm A.
2. **The automatic paths were down.** The prompt hook skipped auto-prepare on its 1 s deadline in 21 of 22 prompts. The stop hook got no daemon receipt in 20 of 22 ("daemon silent", `/v1/receipt` timeout). The daemon logged 162 checkout events and 235 snapshot writes because the harness ran `git checkout` before every task. So arm B got neither the context pack nor Guard.
3. **Fixed overhead on every call.** Arm B's first prompt is about 3.9k tokens bigger (median 19,974 vs 16,033). That comes from the session and prompt hooks (2.4k chars), five Prism skills in the listing and 3.6k chars of MCP instructions. Sessions are about 90% cache reads, so the prefix is paid on each of the ~6 calls.
4. **One extra call per session.** The proof rules nudge the agent to read a neighbour or run `tsc` or wider tests. That's good for quality, but each extra call re-reads the whole context.

### Next fixes, in order

1. **Put the pack in the prompt, don't wait for a tool call.** The prompt hook injects the `prepare_change` result (failing test → target source signatures + test command) as `additionalContext`, so the agent doesn't need ToolSearch. Target: arm-B file reads −50%.
2. **The daemon answers while it re-indexes.** Serve Prepare and the receipt from the last snapshot, labelled stale, instead of timing out. Handle a `git checkout` as an incremental change, not a full rebuild. Target: auto-prepare hit rate ≥ 90% and receipt ≥ 95% in B6.
3. **Cut the fixed overhead to ≤ 1k tokens.** One Prism skill in the listing instead of five, MCP instructions ≤ 1k chars, and the ruleset sent once at SessionStart rather than also on prompts.
4. **Auto-`lite` for scoped test-fix prompts** that already name the failing files: the ruleset only, no extra skills.
5. **Harness:** wait for the index to be ready before each session (as real use has a warm index), and report cold and warm separately. Add the opencode arm (or another host) once a credential exists.
6. Re-run B6 (≥ 10 per arm per host) and B1, then re-fit VAL. Release only when GATE-T1..T4 pass.

## Open risks

- Release is blocked on the token and cost proof. With fixes 1–3 the overhead goes away, but B6 has to show a real saving, which isn't certain yet.
- B6 variance is high (one task ranges 349k–541k tokens in arm A). n = 22 per arm can't show a 5% difference.
- Some benchmarks weren't re-run after P1–P24: B2, B3, B5, the full B4, and B8 on es-toolkit. Ranking and receipt gains are unit-tested but not measured end to end.
- The B9 time budgets are over (Node 23 run); this needs a Node 24 re-run and a decision.
- The CI OS install matrix and the ACT-1 fork-PR comment need a push or a real PR.
- Disk: 8.9 GiB free. The full B4 and B3 need about 6 GiB of clones.
- `apps/website/data/benchmarks-sample.json` was rewritten by today's B1 run (local, uncommitted).

## Owner approvals needed

1. **C-14 hook ceilings 4.5 s / 2.5 s → 1 s (P17).** `gate.mjs` already uses 1,000 ms, and B8 passes at 260 / 688 ms. Approve it or I revert to 4.5 / 2.5 s.
2. **Release stays blocked** until the B6 and B1 gates pass. Confirm we build fixes 1–5 and re-run, rather than shipping with the gate failing.
3. **opencode credential** (a provider key with credit) for the opencode arm, or approve dropping opencode from `REQUIRED_HOSTS` (not recommended: that's a loosening).
4. **The Anthropic API key you created** was never used or saved on disk (it had $0 credit). Revoke it in the Console if you don't need it.
5. **B9 time budgets:** re-run on Node 24 first, then raise them or fix the warm path.
6. **ACT-1:** a real fork PR for the Action comment test.
7. **Commit and push** of the working tree (see below), when you're ready.

## Auth cleanup (P14)

The copied Claude Code sign-in is gone from `/private/tmp/prism-ab/home`. There's no `.claude/.credentials.json` or `.claude.json`, and a search for OAuth or `sk-ant-` content in `/private/tmp/prism-ab`, `/tmp/prism2`, `/tmp/prism-next` and the repo's plans, docs and scripts finds nothing. The macOS keychain holds only the original `Claude Code-credentials` item. The real `~/.claude` and `~/.claude.json` weren't touched. No API key file exists anywhere this work created. Transcripts are kept under the isolated HOME for the report.

## Files changed in the P14 finish (13:30–13:45 IST)

- `scripts/bench/release-gate.mjs`: GATE-T2 now requires Claude Code **and** opencode (`REQUIRED_HOSTS`), with the not-run reason. New CLI: `node scripts/bench/release-gate.mjs [--current DIR]`, which exits 1 on any failure.
- `scripts/publish-npm.mjs`: runs the release gate before any publish, dry-run included. `publish-npm.yml` has the same step. `package.json`: `bench:release-gate`.
- `scripts/bench/b6-report.mjs`: a "Not measured" section and a `--not-run "host: reason"` option. `docs/benchmarks/2.x.{json,md}` regenerated (GATE-T4 byte-identical).
- `scripts/bench/release-gate.test.mjs`: required-host test (9/9 pass).
- `packages/shared/src/session-value.ts` (calibration note), `packages/cli/src/commands/envelope.ts` (wording). shared and cli tsc clean; session-value 5/5, cli commands 17/17.
- `scripts/bench/install-matrix.mjs`: unused import removed (oxlint error).
- `plans/notes/benchmarks/b6-sample-transcripts.md`: matching, redaction and root-cause sections.

## Uncommitted

`git status --porcelain`: **215 paths** (123 modified, 20 deleted, 72 untracked; 220 with untracked files expanded). Nothing committed or pushed since `08e4d3c`.

## Token fixes (14:48–19:35 IST 2026-10-15)

Owner: "fix all" (fixes 1–5 above). Still **no commit, push, publish or deploy**. 239 uncommitted paths (137 modified, 24 deleted, 78 new) on top of `08e4d3c`. Step log: `prism-2-implementation-log.md` § Token fixes.

### What changed

1. **Pack in the prompt.** The prompt hook calls the warm daemon's `prepare_change` and injects the pack as `additionalContext` (≤ 2,400 chars). Named-file prompts get a `lite` pack.
2. **Daemon keeps answering.** `git checkout` is diffed HEAD→HEAD and fed to the incremental path (full re-index only over 2,000 files). Prepare marks a stale index. Read-only git calls use `--no-optional-locks`, which fixes `index.lock exists` after checkout. The lock no longer steals a busy daemon's record. Guard reuses the cached knowledge and feature graphs. The cross-package lens only scans the graph when the session adds a cross-package import. Receipt steady state dropped from ~850 ms to ~315 ms. `canonicalRoot` (realpath) is shared by the workspace key, the pool, the server routes and the hook, so `/tmp` and `/private/tmp` no longer index twice.
3. **Overhead ≤ 1k.** One `prism` skill (4 retired skills are removed on install), and MCP instructions are under 1,000 chars (test-capped). Under Claude Code the ruleset isn't re-sent on SessionStart.
4. **Auto-lite** for prompts that name the failing files, with quiet before-edit nudges.
5. **Harness.** Waits for the index, then for an idle health answer. Counts transcript tokens. Uses `--strict-mcp-config` and `--host opencode` (not run). Refuses a stale dev pack. Uses `PRISM_AB_OAUTH_TOKEN_FILE` (a long-lived token, only in the isolated child env).
- **Pack budget fixes** (found by B4): entries are budgeted on JSON tokens, and the last-resort fit trims body then signatures. Lower-ranked files fall back to slim entries (path, symbols, why). `run` is attached before the hard cap. Only the top file carries signatures (`FULL_SIGNATURE_FILES = 1`), and its signatures are capped at `TOP_FILE_SHARE = 0.25` of the file budget (from a sweep: 0.25 → recall@pack 64.3 on 110 tasks, uncapped → 60.4).
- **Website build:** `node:` stores moved to `@repo-prism/shared/{session-store,session-dedupe,feedback-store}` subpaths.

### B6, Claude Code A/B (`claude-opus-5-5`, es-toolkit + hono, 11 tasks × 2 runs = 22 sessions per arm, transcript tokens)

| | Before: A | Before: B | After: A | After: B |
|---|---|---|---|---|
| Success | 21/22 (95%) | 20/22 (91%) | 22/22 (100%) | 20/22 (91%)\* |
| Median tokens | 92,431 | 134,434 (1.45×) | 109,526 | 121,823 (**1.11×**) |
| Mean tokens | 130,678 | 163,844 | 139,665 | 163,552 (1.17×) |
| Median cost | $0.138 | $0.179 (1.30×) | $0.143 | $0.151 (**1.05×**) |
| Mean cost | – | – | $0.153 | $0.170 |
| Median time | 41 s | 55 s | 51 s | 60 s |
| Prism tool calls | – | 0 | – | 0 |
| Pack injected in prompt | – | 0 of 22 (deadline skip 21/22) | – | 8 of 22 |
| First-call overhead vs A (median) | | +3,941 tok | | **+598 tok** |
| Tasks where B used fewer tokens | | – | | 2 of 11 (es-toolkit-15043d8e 0.53×, hono-afb2068c 0.99×) |

Arm A itself moved from 92k to 110k between the two runs (same tasks, a different day), so compare the B/A ratios, not the raw numbers. The 3 arm-B sessions recorded before the pack fixes were discarded (`/tmp/tf/runs-tf-oldB.jsonl`), and arm B ran entirely on one build. Runs: `plans/notes/benchmark-real-agents/runs-tf.jsonl`. Proof page regenerated: `docs/benchmarks/2.x.{json,md}`.

\* **Both arm-B failures (hono-e5bb2062) are false failures from the harness.** Each agent made a correct one-line regex fix in `src/jsx/utils.ts`, and each fix passes `src/jsx/utils.test.ts` 163/163 when re-applied. hono has no lockfile, so `testsResult` takes the `npx` branch and runs `npx vitest run exec vp test --run <file>`. vitest treats `exec`, `vp` and `test` as file-name filters, so it runs the whole hono suite (144 files). That suite has colour-env-sensitive tests and slow typecheck tests (build/jsx-types, build/declaration-emit, middleware/logger, utils/color, helper/dev) that fail under load or in this env. Upstream's own fix fails the same command here. Both failures ran at 17:20 and 17:31 IST, while B4 ran alongside. Scored as harness behaviour, results not changed. Fixing `testsResult` (no `vitest run` prefix when the args already start with `exec`) needs a re-score of the hono rows. Owner call.

### Other benchmarks

| Benchmark | Before token fixes | After |
|---|---|---|
| B1 orientation with/without tokens | 4.6× (41,931 with-Prism tok in baseline; 4.59× at 13:45) | **4.55×** (35,881 / 7,893; calls 50 vs 250) |
| B4 top-3 (220 tasks, 6 repos) | 38.2 (2.0 baseline 38.6) | **38.6** |
| B4 recall@pack | 54.1 (2.0 baseline; P7 53.3) | **51.9** |
| B4 test precision / recall | 24.7 / 59.3 (baseline) | 28.4 / 65.3 |
| B4 tokens p95 (cap 2,000) | – | 1,996 (0 over cap) |
| B4 held-out top-3 | – | 47.7 |
| B8 m012 prompt / stop p95 | 0.26 s / 0.69 s | 0.52 s / 0.81 s (p50 0.11 / 0.73) |
| B8 es-toolkit prompt / stop p95 (gate file) | baseline 5,711 / 10,837 ms | **599 / 920 ms** (now builds and injects the pack) |
| B8 prompt right after `git checkout` | p50 1,225 / p95 1,413 ms, 13.6% injected | **p50 737 / p95 939 ms, 54.5% injected** |
| B9 medium peak memory | 1,171 MB (Node 23) | **940 MB** (Node 24.21; index cold 20.1 s, warm 2.7 s, incremental 77 ms) |
| B9 large peak memory | 1,804 MB | not re-run (1,804 MB carried) |
| B7 classifier | 0.996 / FP 0.013 | not re-run (unchanged code path) |

B4 file: `/tmp/tf/after/B4-golden-v3.json`. Per repo top-3 / recall@pack: hono 42.5/65, preact 32.5/60, es-toolkit 15/20.5, portpilot 63.3/69, mono 20/24.9, rentmaadi 60/69.7. B8 (`/tmp/tf/after/B8-*-v4.json`) was run on the canonicalRoot build: 78 of 79 stops got a daemon receipt (v3 before canonicalRoot: 0 of 40). Repeated prompts in one B8 session are deduped (P4), and the hook logs that as "no file or symbol matched". The wording is misleading, but the behaviour is unchanged.

### VAL (P13 calibration on B6)

Re-fit on the new runs: **−5,462 tokens per file** (before −29,149), held-out error +68%. **Fail.** `WITHOUT_PRISM_TOKENS_PER_FILE` stays `null`, so the value line still says "not calibrated".

### Release gate (`node scripts/bench/gate.mjs --current /tmp/tf/gate-v4 --release`): FAIL (6), nothing loosened

| Check | Before → after | Result |
|---|---|---|
| B4.top3 | 38.6 → 38.6 | pass |
| B4.recallAtPack | 54.1 → 51.9 (drop > 1) | **fail** |
| B4.testPrecision / testRecall | 24.7 → 28.4 / 59.3 → 65.3 | pass |
| B8 prompt / beforeEdit / afterEdit / stop p95 | 5,711 / 295 / 289 / 10,837 → 599 / 210 / 199 / 920 ms | pass |
| B1.withPrismTokens | 41,931 → 35,881 | pass |
| B7 changeRecall / questionFP | 0.738 → 0.996 / 0.125 → 0.013 | pass |
| C14 prompt / stop p95 ≤ 1,000 ms | 599 / 920 | pass |
| C14 medium / large RSS | 940 MB / 1,804 MB | pass |
| GATE-T1 B1 ratio ≤ 1.0 | 4.55 | **fail** |
| GATE-T2 opencode present | not run | **fail** |
| GATE-T2 Claude Code n ≥ 10/arm | 22 | pass |
| GATE-T2 Claude Code median tokens B ≤ A | 109,526 → 121,823 | **fail** |
| GATE-T2 Claude Code median cost B ≤ A | $0.1433 → $0.1507 | **fail** |
| GATE-T2 Claude Code success B ≥ A | 1.00 → 0.909 (both harness false failures) | **fail** |
| GATE-T3 public only / GATE-T4 regenerates | – | pass |
| B2, B3, B5 | not re-run | skipped (8 rows) |

`bun run bench:release-gate` (docs only): FAIL (5), the same release rows plus "B1 missing in docs/benchmarks".

### Checks

Build 16/16, format:check, lint, typecheck, integration and unit all pass on the final build (19:30 IST). Two unit tests only fail under heavy load: core `safe-delete.test.ts` "testImpact matches the golden report" (5.1–11 s at load 7–23; 1.3–1.6 s at load 3.7, 3/3 pass) and mcp-server `daemon.test.ts` "uses the daemon's pack when it answers" (743 ms at load 10; 102–209 ms alone, 3/3 pass). Neither limit was loosened. A runaway python process from an earlier worker shell (99% CPU since 17:30) was killed at 19:28. It added load to the B4, B6 (last third) and B8-v3 runs. No Prism daemons left running. `~/.prism-ab-token` was deleted at 18:39. The isolated HOME has no credentials, and the real `~/.claude` was not touched.

### Still not good enough

- With Prism, Claude Code still uses **11% more tokens and 5% more cost** (median), and only 2 of 11 tasks got cheaper. The agent still never calls a Prism tool, and the pack reached the prompt in only 8 of 22 sessions.
- recall@pack is 51.9 against 54.1 (gate −1 rule). The remaining cost is the per-file fields added in P2/P9 (signatures key, confidence, provenance). Cutting them is an API-shape decision for the owner.
- B1 orientation is still 4.55× tokens. opencode isn't measured (needs a provider key). The harness hono test command needs the fix above plus a re-score.

## Round 2 (19:36 IST 15 Oct – 16 Oct 2026): final section, refreshed 12:52 IST

**Status: final.** Every planned session that could run has run and been graded blind by Claude Code. Two subsets were cut on purpose and are stated below (Cursor agent main run, opencode probes). Nothing is committed or pushed. ~/.prism-ab-token: deleted 12:50 after all grading, confirmed gone.

### Owner summary (plain language)
- **Where Prism helped:**
  - **Code review on Claude Code.** In the first run, Claude with Prism found all 11 planted problems; without Prism it found 9. On two later re-runs both found 10 of 11. So Prism is never worse at review, but the first-run lead was partly luck.
  - **Code review on the Cursor agent.** With the fixed Prism, the Cursor agent found 4 of 7 planted problems, against 3 of 7 without Prism, and used fewer words of conversation (median 670,605 against 979,394). The sample is small.
  - **Custom habits and skills.** Whenever Prism was installed, custom skills worked every time on every tool (10 of 10). Custom habits worked every time on the Cursor agent (4 of 4) and opencode (2 of 2). Without Prism they never ran (0 every time).
  - **The "write a test for this bug" check.** After tonight's fixes it passes every time on Claude Code, with and without Prism (2 of 2 each), and on the Cursor agent (4 of 4 each).
  - **Small tasks on the free opencode model.** With Prism the free model got 8 of 11 small tasks working against 7 of 11 without, and used about a quarter fewer words of conversation (median 407,487 against 549,036). But see the loss below: the grader liked the code without Prism better.
- **Where Prism did not help, or made things worse:**
  - **Multi-step follow-up work on Claude Code was worse with Prism.** Both got 8 of 9 working, but the blind grader rated the Prism work lower (correctness 3.78 against 4.67 out of 5) and preferred the version without Prism 4 times to 1.
  - **Small and bigger tasks on Claude Code were a tie.** Same success (11 of 11, 6 of 6). The saving in words of conversation is small and could be chance.
  - **Naming the "QA" reviewer by hand during review on Claude Code** did not find more planted problems (9 of 11 in two of three runs, against 9–10 without Prism) and cost more (median 158,874 against 136,006 words of conversation on the fixed build). Its extra remarks were real problems, though: the grader agreed with 6 of 6.
  - **opencode code quality was worse with Prism.** The blind grader preferred the version without Prism 6 times to 2 (3 ties): correctness 3.64 against 3.82, "no more code than needed" 3.36 against 4.00, house style 3.09 against 3.82.
  - **On the Cursor agent, Prism made follow-up work cost more** (median 3,764,972 against 2,283,649 words of conversation) for the same result (2 of 2).
  - **Custom "lens" (a reviewer style you write yourself).** Even after the fix it reached Claude only half the time (2 of 4 tries), because Prism's helper sometimes answers too late. On the Cursor agent and opencode it cannot start by itself at all.
- **Bugs found and fixed:** a custom reviewer style reached the agent as just its name; improved built-in reviewer instructions never reached existing installs; review did not use the "write less code" checklist. Each fix has a test.
- **Two open design decisions for you:**
  1. When a check fails, Prism briefly puts the changed files back to how they were, in the real project folder, to re-run the tests. Anything that looks at the folder in that moment sees the work gone. Proposal: do this in a separate throwaway copy instead.
  2. About 1 request in 10 gets no Prism help, because Prism's helper is busy re-reading the project after a big switch of versions. Proposal: answer the quick parts first and do the slow re-reading in the background.

### Cross-tool comparison (same tasks, with vs without Prism inside each tool)
Arms: A no Prism · B Prism automatic · L lens named (Architect for code, QA for review) · P ponytail plugin (Claude Code only). Tool split: Claude Code (claude-opus-5-5) medium tasks plus the grader; Cursor agent CLI (grok-4.7-high) bigger, 3-turn follow-up and review, 20-minute limit; opencode (opencode/mimo-v2.6-flash-free) small tasks, 10-minute limit. Tokens are host-reported totals (input + output + cache reads + cache writes); compare arms within one tool only.

| Tool | Set | Arm | Sessions | Result | Median tokens | Median seconds | Sessions calling Prism |
|---|---|---|---|---|---|---|---|
| Claude Code (r2) | bigger | A | 6 | correct 6/6, timed out 0 | 172,985 | 53 | – |
| Claude Code (r2) | bigger | B | 6 | correct 6/6, timed out 0 | 153,370 | 53 | 0 |
| Claude Code (r2) | bigger | L | 6 | correct 6/6, timed out 0 | 206,430 | 56 | 0 |
| Claude Code (r2) | bigger | P | 6 | correct 6/6, timed out 0 | 150,624 | 44 | 0 |
| Claude Code (r2) | followup | A | 9 | correct 8/9, timed out 1 | 399,286 | 114 | – |
| Claude Code (r2) | followup | B | 9 | correct 8/9, timed out 0 | 359,169 | 117 | 0 |
| Claude Code (r2) | review | A | 6 | planted found 9/11 (82%), precision planted-only 92% | 90,880 | 22 | – |
| Claude Code (r2) | review | B | 6 | planted found 11/11 (100%), precision planted-only 87% | 119,753 | 32 | 0 |
| Claude Code (r2) | review | L | 6 | planted found 9/11 (82%), precision planted-only 65% | 102,817 | 48 | 0 |
| Claude Code (r2) | review | P | 6 | planted found 10/11 (91%), precision planted-only 85% | 133,694 | 35 | 0 |
| Claude Code (r2) | small | A | 11 | correct 11/11, timed out 0 | 144,373 | 42 | – |
| Claude Code (r2) | small | B | 11 | correct 11/11, timed out 0 | 134,414 | 42 | 0 |
| Claude Code repeat review (r2fix, old Architect text) | review | A | 6 | planted found 10/11 (91%), precision planted-only 79% | 111,142 | 24 | – |
| Claude Code repeat review (r2fix, old Architect text) | review | B | 6 | planted found 10/11 (91%), precision planted-only 79% | 99,934 | 24 | 0 |
| Claude Code repeat review (r2fix, old Architect text) | review | L | 6 | planted found 10/11 (91%), precision planted-only 81% | 114,689 | 33 | 0 |
| Claude Code repeat review (r2fix, old Architect text) | review | P | 6 | planted found 10/11 (91%), precision planted-only 91% | 155,073 | 39 | 0 |
| Claude Code review, fixed build (r2fix2) | review | A | 6 | planted found 10/11 (91%), precision planted-only 87% | 136,006 | 29 | – |
| Claude Code review, fixed build (r2fix2) | review | B | 6 | planted found 10/11 (91%), precision planted-only 79% | 129,654 | 29 | 0 |
| Claude Code review, fixed build (r2fix2) | review | L | 6 | planted found 9/11 (82%), precision planted-only 60% | 158,874 | 39 | 1 |
| Claude Code review, fixed build (r2fix2) | review | P | 6 | planted found 10/11 (91%), precision planted-only 75% | 168,469 | 34 | 0 |
| Cursor agent CLI | bigger | A | 4 | correct 4/4, timed out 0 | 1,328,142 | 316 | – |
| Cursor agent CLI | bigger | B | 3 | correct 3/3, timed out 0 | 1,455,138 | 294 | 3 |
| Cursor agent CLI | bigger | L | 2 | correct 2/2, timed out 0 | 1,175,438 | 275 | 2 |
| Cursor agent CLI | followup | A | 2 | correct 2/2, timed out 0 | 2,283,649 | 780 | – |
| Cursor agent CLI | followup | B | 2 | correct 2/2, timed out 0 | 3,764,972 | 679 | 2 |
| Cursor agent CLI | review | A | 4 | planted found 3/7 (43%), precision planted-only 75% | 979,394 | 607 | – |
| Cursor agent CLI | review | B | 1 | planted found 1/2 (50%), precision planted-only 100% | 943,377 | 541 | 1 |
| Cursor agent CLI | review | L | 1 | planted found 1/2 (50%), precision planted-only 100% | 347,011 | 317 | 1 |
| Cursor agent CLI review, fixed build (r2fix) | review | B | 4 | planted found 4/7 (57%), precision planted-only 80% | 670,605 | 469 | 4 |
| Cursor agent CLI review, fixed build (r2fix) | review | L | 4 | planted found 3/7 (43%), precision planted-only 75% | 505,833 | 382 | 4 |
| opencode free | small | A | 11 | correct 7/11, timed out 4 | 549,036 | 591 | – |
| opencode free | small | B | 11 | correct 8/11, timed out 3 | 407,487 | 363 | 10 |

Blind grader (1–5, Claude Code grading every tool; pairs where both arms exist):
- Claude Code small: correctness 4.27 (A) vs 4.55 (B), minimal 4.36 vs 4.27, style 4.18 vs 4.09; preferred 3–3, 5 ties. Mean tokens 159,980 vs 152,342 (−7,638; 95% range −66,812 to +46,653).
- Claude Code bigger: correctness 4.50 / 4.33 / 4.17 / 4.17 (A/B/L/P); minimal 4.17 / 4.33 / 4.00 / 4.33.
- Claude Code follow-up: correctness 4.67 vs 3.78; preferred A 4, B 1, 4 ties. Turn medians A 132,663 / 130,809 / 106,541 vs B 164,953 / 143,257 / 150,657.
- Cursor agent bigger: correctness 5.00 (A) / 5.00 (B) / 3.50 (L), minimal 4.60 / 4.67 / 4.00; 5 pairs, 4 ties, 1 preferred A. Follow-up: 2 pairs, both ties (5.00 / 4.50 / 4.50 each).
- opencode small: success 7/11 (A) vs 8/11 (B), 4 vs 3 timed out; correctness 3.82 vs 3.64, minimal 4.00 vs 3.36, style 3.82 vs 3.09; preferred A 6, B 2, 3 ties. Median tokens 549,036 vs 407,487.
- Review, fixed build: extra (non-planted) findings the grader judged real: Claude A 2/2, B 3/3, L 6/6, P 3/4; Cursor agent B 1/1, L 1/1. So the lower "planted-only" precision of L is mostly real extra problems, not noise.

### Feature by feature (pass = every check in the probe passed; A = without Prism, B = with Prism)
Probes on es-toolkit at 827b92f7. "Fixed build" rows are Claude re-runs after tonight's lens fixes (they replace the earlier Claude lens/QA rows for the verdict).

| tool | check | no Prism | with Prism |
|---|---|---|---|
| Claude Code | habit-auto | 0/2 | 0/2 |
| Claude Code | habit-invoked | 0/2 | 2/2 |
| Claude Code | lens-auto | – | 0/2 |
| Claude Code | lens-invoked | – | 0/2 |
| Claude Code | qa-auto | 2/2 | 0/2 |
| Claude Code | qa-invoked | 2/2 | 2/2 |
| Claude Code | skill-auto | – | 2/2 |
| Claude Code | skill-invoked | – | 2/2 |
| Claude Code (fixed build) | lens-auto | – | 1/2 |
| Claude Code (fixed build) | lens-invoked | – | 1/2 |
| Claude Code (fixed build) | qa-auto | 2/2 | 2/2 |
| Cursor agent | habit-auto | 0/2 | 2/2 |
| Cursor agent | habit-invoked | 0/2 | 2/2 |
| Cursor agent | lens-auto | – | 0/2 |
| Cursor agent | lens-invoked | – | 2/2 |
| Cursor agent | qa-auto | 2/2 | 2/2 |
| Cursor agent | qa-invoked | 2/2 | 2/2 |
| Cursor agent | skill-auto | – | 2/2 |
| Cursor agent | skill-invoked | – | 2/2 |
| opencode | habit-auto | 0/1 | 1/1 |
| opencode | habit-invoked | 0/1 | 1/1 |
| opencode | lens-auto | – | 0/1 |
| opencode | lens-invoked | – | 0/1 |
| opencode | qa-auto | 1/1 | 1/1 |
| opencode | qa-invoked | 1/1 | 1/1 |
| opencode | skill-auto | – | 1/1 |
| opencode | skill-invoked | – | 1/1 |

Before → after the fixes (Claude Code): custom lens invoked 0/2 → 1/2, automatic 0/2 → 1/2 (both misses: the lens never reached the agent, the prompt hook answered late); QA automatic B 0/2 → 2/2, A 2/2 → 2/2. Habit automatic on Claude stays 0/2 both arms (Claude ran the habit with Prism but reworded the commit titles; check not loosened). House style: 0 lint/format breaks in Claude's 64 code sessions; grader style ties. Dev minimal code: size vs the maintainers' fix median 1.00 vs 1.00 small, 0.87 vs 0.91 bigger; no consistent gain.

### Does review use the Architect minimal-code mechanism? (verified)
- Before tonight: no. The lean "delete code first" pass lived only in the Dev procedure; review routed to Architect, which covered structure only; "review the last commit" fell through to Dev.
- Fixed: Architect step 6 is the Dev lean pass (1,123 characters, under the 1,400 budget); "review the last/latest/this commit" routes to Architect; shipped-procedure upgrade so existing installs get it. Tests in lens-route.test.ts and lens-store.test.ts.
- Measured on the fixed build: the lean-pass text reached 5 of 6 automatic-Prism Claude review sessions (the sixth, jsx-gap B, got no lens). The old-text repeat run (r2fix) had it in 0 of 23.
- Effect: none measurable on planted-problem recall (B 10/11 with it, 10/11 without it in r2fix).

### Prism bugs
| Bug | Status |
|---|---|
| Custom lens reached the agent as "Lens: Perf" only | **Fixed** (`lensProcedure()` falls back to role/focus/checklist), test |
| Shipped lens-procedure updates never reached existing installs | **Fixed** (`SHIPPED_PROCEDURES` hashes; edited lenses kept), test |
| Review lacked the minimal-code pass; "review the last commit" routed to Dev | **Fixed**, tests |
| Receipt baseline rewrites the live working tree while re-running checks | **Open – design decision 1.** Proposal: baseline in a throwaway `git worktree` linked to the installed dependencies; interim: never overwrite a file whose bytes changed during the window |
| Prompt hook gives up (~1 in 10 prompts, "no answer within ~847 ms") right after a large checkout while the daemon re-indexes; `lensFor` marks a lens shown before delivery | **Open – design decision 2.** Proposal: answer the lens part of /v1/prompt before waiting on the index; move snapshot writes off the daemon main thread; mark the lens shown only after delivery |

### Harness and setup fixes (tests: agent-ab 25/25, release-gate 10/10)
- `settlePrism()`/`prismBusy()` wait for Prism's checks and baseline before scoring; `--only task:set:arm` filter (`wanted()`); probes stop on a host usage limit; coverage folder removed with retries; Cursor agent `--resume` follow-ups; opencode `--session`/`--dir`; follow-up token sums fixed; audit path fixes.
- **My setup error today (not a harness bug):** after the 10:00 reboot I installed es-toolkit once and copied it into the work folders one level deeper. Yarn PnP stores relative cache paths, so `yarn exec vitest` failed there ("Missing package: vitest@virtual…"). Caught by the QA probe (both arms failed "passes on the fix"). Fixed by installing in place in all 4 work folders; 4 affected rows discarded and re-run.

### Sandbox differences
- Claude Code: OS sandbox (checkout + toolchain reads only, no network, web tools denied), isolated HOME, transcript audit of every command.
- opencode: permission rules only (web fetch and outside folders denied); shell commands not confined; session history goes to the owner's opencode data folder.
- Cursor agent CLI: no sandbox (its sandbox mode still reads home and reaches the network); owner's sign-ins and settings minus Prism.

### Reliability and what was cut
- **Sleep, not memory:** the 10:16 drop was the Mac idle-sleeping on battery 10:11:25–10:34:23 (power log); caffeinate had died. Restarted (`caffeinate -i -m -d`); memory stayed 60–69% free. The 4 sessions in flight across the sleep (all timed out with inflated seconds) were discarded and re-run. The earlier 06:00–10:00 outage cut no session (all rows end before 05:58).
- **At most 2 runners** from 10:38 at the owner's request.
- **Cursor agent main run cut** from 46 to 19 sessions (13 earlier + a 6-session subset completing pairs); the other 33 would have taken 4–5 hours. Treat its numbers as a small sample.
- **Disk:** guard at 600 MB / 1.5 GB (unchanged); 6 earlier sessions overlap a pause (their seconds are inflated, tokens are not).
- **Prompt hook skips:** 9 of 88 Claude prompts (design decision 2).
- **Repeat runs:** Claude review 9/11/9/10 → 10/10/10/10 → 10/10/9/10 of 11 (A/B/L/P) across three runs.

### VAL, gate, checks
- **Published** (`b6-report.mjs publish`, backup /tmp/r2/docs-backup-final; `check`: report matches raw JSON): Claude Code small 11 A / 11 B: median tokens 144,373 → 134,414 (ratio 0.93), median cost $0.168 → $0.185 (ratio 1.10), success 11/11 both. opencode small 11 / 11: median tokens 549,036 → 407,487 (ratio 0.74), success 7/11 → 8/11, cost $0 (free model, so cost means nothing there).
- **VAL: fail.** Claude Code: 13 tokens per file fitted on 6 tasks; held-out estimate −1,182 vs measured 85,515 (−101%). opencode: nothing to calibrate (Prism reported no files sent in arm B). `saved ~N tokens` stays off.
- **Gate inputs rebuilt** 12:15–12:18 from the fixed build (source identical to the working tree): B1, B7, B8 es-toolkit, B9 medium, B10 (all 4 hosts pass install + doctor + sample hook). **Missing, reported as skipped:** B4 (golden clones lost), B9 large, B2/B3/B5 (not re-run this round).
- **Release gate** (`gate.mjs --current /tmp/r2/gate-r2 --release`, nothing loosened): **FAIL (3)**, 18 pass, 13 skipped:
  - GATE-T1 B1 ratio 4.54 (≤ 1.00): B1's simulated reader always reads less than Prism answers; with-Prism tokens 35,844 vs baseline 41,931 pass.
  - GATE-T2 Claude Code cost: median $0.168 → $0.185 with Prism.
  - C14 stop p95 1,307 ms (≤ 1,000): this B8 ran while graders and opencode probes were running (load 7.6). Re-run at 12:51 on the idle machine: stop p95 550, prompt 923, before/after edit 39/39 ms; the gate on that input (/tmp/r2/gate-r2-quiet) is **FAIL (2)**, 19 pass, 13 skipped (T1 and Claude cost remain). Both results are reported; neither threshold was touched.
  - Passes include: B7 change recall 0.996 / question false positive 0.013; B8 vs baseline; C14 prompt 923 ms and medium memory 1,016 MB; Claude Code tokens and success; opencode n 11/arm (was 4), tokens, success; T3 public-only; T4 regenerates.
- **Checks** (clone, same source): typecheck clean, lint clean, format clean, unit tests 1,152/1,152, release-gate tests 10/10, harness tests 25/25 (run before this morning's runs; no source changed since).

```
skipped B2.top3                  B2-prepare-eval.json missing in current
skipped B2.recallAtPack          B2-prepare-eval.json missing in current
skipped B2.testPrecision         B2-prepare-eval.json missing in current
skipped B2.testRecall            B2-prepare-eval.json missing in current
skipped B4.top3                  B4-golden.json missing in current
skipped B4.recallAtPack          B4-golden.json missing in current
skipped B4.testPrecision         B4-golden.json missing in current
skipped B4.testRecall            B4-golden.json missing in current
skipped B3.catchRate             B3-replay.json missing in current
skipped B3.falseAlarmRate        B3-replay.json missing in current
pass    B8.prompt.p95            5711 → 923 (rise > 15%)
pass    B8.beforeEdit.p95        295 → 60 (rise > 15%)
pass    B8.afterEdit.p95         289 → 39 (rise > 15%)
pass    B8.stop.p95              10837 → 1307 (rise > 15%)
skipped B5.editToVisible.p95     B5-freshness.json missing in current
skipped B5.warmPrepare.p95       B5-freshness.json missing in current
pass    B1.withPrismTokens       41931 → 35844 (rise > 5%)
pass    B7.changeRecall          0.738 → 0.996 (any drop)
pass    B7.questionFP            0.125 → 0.013 (any rise)
pass    C14.prompt.p95           ≤ 1000 ms → 923 (C-14 ceiling)
fail    C14.stop.p95             ≤ 1000 ms → 1307 (C-14 ceiling)
pass    C14.mediumRss            ≤ 1717986918 B → 1015808000 (C-14 ceiling)
skipped C14.largeRss             metric absent
fail    GATE-T1.B1ratio          ≤ 1.00 → 4.54 (release)
pass    GATE-T2.ClaudeCode.n     ≥ 10/arm → 11 (release)
pass    GATE-T2.ClaudeCode.tokens 144373 → 134414 (with ≤ without (median))
fail    GATE-T2.ClaudeCode.cost  0.16760299999999997 → 0.18491799999999997 (with ≤ without (median))
pass    GATE-T2.ClaudeCode.success 1 → 1 (with not lower)
pass    GATE-T2.opencode.n       ≥ 10/arm → 11 (release)
pass    GATE-T2.opencode.tokens  549036 → 407487 (with ≤ without (median))
pass    GATE-T2.opencode.cost    0 → 0 (with ≤ without (median))
pass    GATE-T2.opencode.success 0.6363636363636364 → 0.7272727272727273 (with not lower)
pass    GATE-T3.publicOnly       no private names → none (release)
pass    GATE-T4.regenerates      byte-identical → same (release)
gate: FAIL (3); 13 skipped; 0 release warnings
```

### Precision of what Prism hands the agent (B4)
Not re-run this morning: the golden clones (including two private repos) were lost with /tmp at the 10:00 reboot. Last measured 23:19 IST on the round-2 build: top-3 39.5 (≥ 38.6 ✓), recall@pack 63.1 (≥ 53.1 ✓), test-impact P/R 27.5/65.8, prompt-block precision 81.3%, pack tokens p95 1,999. The gate reports B4 as skipped, not passed.

### Still open
- Design decisions 1 and 2 above (owner).
- Follow-ups are worse with Prism on Claude Code: look at what follow-up turns inject.
- GATE-T1 (B1 simulated reader) fails by design of B1; needs an owner call on whether B1 stays a release rule.
- VAL fails, so `saved ~N tokens` stays off.

## Round 3 (16 Oct 2026, 13:20–17:45 IST): the four approved fixes

Everything uses the local build: the dev pack's server is `/Users/shaileshjha/Prism/packages/mcp-server/dist/bin.js`. Nothing was committed, pushed or published.

Only what the fixes affect was re-run:
- Claude follow-up A/B: same 9 tasks, same blind grader (`claude-opus-5-5`).
- opencode small A/B: same 11 tasks, `mimo-v2.6-flash-free`, 10-minute cap.
- The release gate.
- A small regression check: reviews, custom skills, habits, lenses, QA.

The full suite was not re-run. A = without Prism, B = with Prism.

### Owner summary (plain language)

- **Follow-ups (item 1):**
  - The real cause was a Prism bug, not the model. When a check failed, Prism re-ran the tests on the old code by putting files back in your live folder, while the agent was already working on the next turn. That could wipe the agent's edits.
  - Prism now does that re-run in a throwaway copy and never touches your folder.
  - It also stopped "remembering" files the agent never actually received.
  - Result: the correctness gap went from 0.89 points to 0.11.
  - Still a loss: the code with Prism was graded less minimal (3.89 vs 4.44), and the grader still preferred no-Prism 3 times to 1 (5 ties).
- **opencode quality (item 2):**
  - opencode never received the "smallest complete change" steps. Now they come first in every `prepare_change` answer. I checked: they were present in all 10 calls.
  - Minimalism is now equal (4.36 vs 4.36; it was 3.36 vs 4.00).
  - Style is much closer (4.09 vs 4.36; it was 3.09 vs 3.82).
  - Still a loss: correctness with Prism is lower (4.27 vs 4.64), and the grader preferred no-Prism 4 to 2.
  - Tokens stay about 28% lower with Prism.
- **Design decisions (item 3):** both done.
  - (a) The failed-check re-run happens only in a throwaway copy.
  - (b) The lens is answered straight away, and the file list is added only when the index is ready, so a busy re-index no longer means "nothing".
- **Release gate (item 4):** 1 failure is left.
  - The Claude cost row compares the published Claude small-task proof ($0.168 → $0.185 median). Claude small tasks were out of scope for this round, so it was not re-measured.
  - B1, which failed in Round 2 at 4.54, now passes at 0.92. That is because of a fix to how B1 counts, not a product gain: see below.

### Item 1: Claude follow-ups (9 tasks × 1 run, three turns each)

| | Round 2 A | Round 2 B | Round 3 A | Round 3 B |
|---|---|---|---|---|
| Correctness (grader, 1–5) | 4.67 | 3.78 | 4.56 | **4.44** |
| Minimalism | 4.44 | 4.11 | 4.44 | 3.89 |
| Style | 4.22 | 4.11 | 4.44 | 4.00 |
| Grader preferred | A 4 · B 1 · tie 4 | | A 3 · B 1 · tie 5 | |
| Tests pass | 8/9 | 8/9 | 9/9 | 8/9 |
| Median tokens per session | 399k | 359k | 535k | 548k |

**Cause:**
- The M-092 "baseline" re-run, which checks whether a failed test also fails without the session's edits, restored HEAD versions of the session's files in the working tree.
- In a follow-up, the next turn started while that re-run was still going, and the write-back then overwrote the agent's new edits.
- Round 2 evidence: es-toolkit-3433044c B ended with an empty diff after a passing turn.
- This is the same bug as decision 3a, so one fix covers both.

**Second fault:** the daemon recorded files in session memory ("same as before") even when the hook had missed its deadline and the agent never saw them.

**Third fault, found during this round:** a capital that only starts a sentence ("Next: the tests below…") counted as naming a symbol. In hono it matched the `Next` type, so `src/types.ts` was put on every follow-up turn as "named in task".

**Where Round 3 B still lost:**
- **es-toolkit-3433044c** (bundle-size snapshot): B timed out at 10 minutes, brute-forcing byte sizes. No Prism step was involved. In Round 2, A timed out on the same task.
- **hono-3d8abbc2:** B also changed a path the task did not ask for, so it was graded less minimal.
- **es-toolkit-e62aa15f:** B's fix was graded harder to read.

**Where B won:** hono-b20d4225. The session memory now surfaced `buffer.ts`, B fixed it, and A did not.

Tokens: with Prism, the median was 2% higher (548k vs 535k). In Round 2 it was 10% lower. This is an honest loss on a small sample.

### Item 2: opencode small (11 tasks × 1 run)

| | Round 2 A | Round 2 B | Round 3 A | Round 3 B |
|---|---|---|---|---|
| Minimalism | 4.00 | 3.36 | 4.36 | **4.36** |
| Style | 3.82 | 3.09 | 4.36 | **4.09** |
| Correctness | 3.82 | 3.64 | 4.64 | 4.27 |
| Grader preferred | A 6 · B 2 · tie 3 | | A 4 · B 2 · tie 5 | |
| Tests pass | 7/11 | 8/11 | 8/11 | 8/11 |
| Median tokens | 549k | 407k | 574k | 414k |

Cause and fix:
- opencode has no prompt hook. It got Prism only through `prepare_change`, and that answer had no lens. It was a 19-file, 8k-character pack.
- `prepare_change` now leads with `lens: {name, steps}`: once per session when a session id is given, and always otherwise.
- Checked in the opencode database: the lens was the first field in all 10 `prepare_change` answers of the run.
- Both arms scored higher than in Round 2 on the same tasks, so part of the change is run-to-run variance of the free model.

### Item 3: design decisions

- **(a) The failed-check re-run never touches the live folder.**
  - `withBaselineCopy` builds a temporary copy from HEAD (`git checkout-index` with a temporary index) and adds the changes that existed before the session.
  - It links `node_modules` only, so tools like coverage cannot write back, and runs the check there.
  - It always deletes the copy, even on error.
  - Yarn Plug'n'Play repos are refused, because PnP cannot run from a copy, so the failure stays "cause unknown", which is the safe side.
  - The old live-folder recovery is kept only to repair an interrupted run from an older build.
  - Tests: a live edit made during the run is never overwritten; the copy shows HEAD for session files and keeps the earlier change; the copy is removed on error.
- **(b) The quick part first.**
  - The prompt hook works out the lens itself from the lens store, without waiting for an index, and asks the daemon only for the file list.
  - If the daemon is busy or misses the deadline, the lens still goes out and the index keeps building.
  - The Claude plugin hook now runs this same path (`prism-mcp --hook prompt`), so Claude, opencode and the daemon-off path share one code path.
  - The hook's 1 s budget counts from the process's own start.
  - In the run, turn 1 after a checkout (daemon busy) got the lens in 809 ms instead of nothing. Claude prompt hook: 22 injections, p50 306 ms, p95 800 ms, 1 deadline.

### Item 4: release gate (`gate.mjs --current /tmp/r3/gate --release`): FAIL (1), 8 skipped

The run was on an idle machine, after the A/B runners had finished. The public clones (preact, PortPilot, hono, es-toolkit) were made fresh. mono is a local clone of this repository, and rentmaadi is a local clone kept on this Mac only; its numbers are included, its tasks stay in `~/.prism-dev/golden/`.

| Check | Round 2 | Round 3 |
|---|---|---|
| GATE-T1 B1 with/without token ratio (≤ 1.00) | 4.54 fail | **0.92 pass** (7,270 vs 7,869) |
| GATE-T2 Claude cost, published B6 small (with ≤ without) | $0.168 → $0.185 fail | same data, **fail** (not re-measured, out of scope) |
| GATE-T2 Claude tokens / success | pass | pass |
| GATE-T2 opencode n / tokens / success | pass | pass |
| B4 golden (220 tasks, 6 repos): top-3 | skipped | 38.6 → 39.1 pass |
| B4 recall@pack | skipped | 54.1 → 61.8 pass |
| B4 test precision / recall | skipped | 24.7 → 27.9 / 59.3 → 64.9 pass |
| B8 hook p95, prompt / stop | 923 / 1,307 ms (stop failed C-14) | **896 / 508 ms** pass |
| C-14 medium RSS (≤ 1.72 GB) | 1.02 GB | 1.56 GB pass (higher; not investigated) |
| C-14 large RSS (≤ 3.22 GB, 50k files) | skipped | 2.40 GB pass |
| B7 classifier change recall / question FP | 0.996 / 0.013 | 0.996 / 0.013 |
| B10 install matrix | pass | pass (Claude, Cursor, Codex, opencode) |
| GATE-T3 / T4 | pass | pass |

**About the B1 fix:**
- Round 2's B1 charged the result of the `index` step as an agent read in every scenario, but no Prism tool returns it to the agent.
- B1 now runs the index as an uncounted setup step, and its method text says so.
- The ratio fell from 4.54 to 0.92 only because of that counting fix, not because the product changed.
- Side effect: running B1 also rewrites `apps/website/data/benchmarks-sample.json`.

**Skipped checks (8):**
- **B2** (4 checks): the prepare-eval set needs a zod clone and its mined task file. Not touched by this round's fixes.
- **B3** (2 checks): this checkout has no script to re-create the replay benchmark.
- **B5** (2 checks): freshness (`daemon-freshness.mjs`) was not run. It was not touched by the fixes.
- All three were also skipped in Round 2.
- At 17:31 there were 10 skips, because `run.mjs` joins `--out` to the repo root, so the B9 files landed in `./tmp/…`. The files were moved and the gate re-run, which brought it to 8.

### Regression check (Claude, isolated HOME)

| Probe | Round 2 B | Round 3 B |
|---|---|---|
| Custom habit, invoked | 2/2 | 1/1 |
| Custom skill, invoked / auto | 2/2 · 2/2 | 1/1 · 1/1 |
| Custom lens, invoked / auto | 0/2 · 0/2 (1/2 · 1/2 after the fix) | 2/2 · 2/2 |
| QA lens, auto | 0/2 (2/2 after the fix) | 1/1 |
| Review subset (meanBy, combine, etag): seeds found, extra findings | 6/6, 0 (5/6 after the fix) | 5/6, 0 (A: 4/6) |

### Code changes (uncommitted)

- `mcp-server/src/safety/baseline.ts`, `receipt.ts`: the baseline re-run moved to a throwaway copy (3a).
- `mcp-server/src/safety/prompt-context.ts`, `hook-command.ts`:
  - The lens is worked out in the hook.
  - Files go into session memory only once they are delivered (`rememberShown`).
  - The hook budget counts from process start.
  - The lite-session mark moved here (3b, item 1).
- `plugin/hooks/prism-hook.mjs`: the Claude prompt hook runs `prism-mcp --hook prompt` instead of calling `/v1/prompt` itself. Before this, the move of the lens had left Claude without a lens or session memory. The first 4 sessions of this round ran that way; they were discarded and are not in any number above.
- `mcp-server/src/tools/prepare.ts`: `prepare_change` leads with the lens (item 2).
- `intelligence/src/prepare/pack.ts`: a capital that only starts a sentence is not a named symbol (item 1).
- `shared/src/ruleset.ts` and `plugin/hooks/prism-rules.md`: the rules name the "Prism · files for this task" block.
- Benchmarks:
  - `scripts/bench/agent-orientation.ts`: the B1 counting fix.
  - `scripts/bench/feature-probes.ts`: the output file is tagged per round.

Checks:
- typecheck, lint and format pass.
- Unit tests pass except the plugin's prompt-hook timing tests, which are flaky on this Mac under memory pressure (see below).

### Still open

- **The prompt hook now starts a second Node process** (about 0.2 s). On this 8 GB Mac with 5.4 GB of swap in use, the plugin's 1 s prompt tests failed in 2 of 5 runs. An older, unrelated plugin test (session start) also took over 10 s in those runs.
  - In the real A/B the hook stayed under 1 s (p95 800 ms).
  - It needs a decision: keep it, or give the plugin a dependency-free lens path like `classify-prompt.mjs`.
- **Follow-up minimalism and tokens with Prism** are still worse than without it on this sample.
- **Claude cost on small tasks** (GATE-T2) needs a new B6 Claude small run before release.
- **Medium-scale peak memory** rose from 1.02 GB to 1.56 GB (still under the 1.72 GB ceiling). The cause has not been checked.

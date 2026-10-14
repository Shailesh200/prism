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

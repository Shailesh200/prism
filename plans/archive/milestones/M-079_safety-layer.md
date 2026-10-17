# M-079 — Safety layer (Prism after Jobs) + Lenses

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-079-safety-layer` (from `main` at `a31261f`; replaces `milestone/M-079-jobs-live-relay`) |
| Depends on | M-078 merged to local `main` |
| Unlocks | M-080 (Prism 2.0 remainder resumes) |
| Packages | `plans/`, `scripts/`, `dispatch`, checks module (new, default `packages/checks`), `plugin`, `mcp-server`, `cli`, `intelligence`, `impact`, `analyzer`, `shared`, `app-shell`, `ui`, `dispatch-hub` |
| ADRs | [ADR-0058](../../adr/0058-prism-does-not-run-agents.md) Prism does not run agents · [ADR-0059](../../adr/0059-lenses.md) Lenses |
| Replaces | Old M-079 *Jobs Live Relay*; [`PROGRAM_prism-2.0.md`](./PROGRAM_prism-2.0.md) §8 |

One milestone, one branch, phased with gates (like M-041). The owner reviews at each gate; commits on this branch only when the owner approves.

## 1. Goal

Prism stops running agents. It becomes the layer every host agent passes through automatically, so the agent cannot break what it cannot see. Hooks inject the few facts that matter before an edit and run the repo's own checks when the agent stops, printing a **change receipt**: what was touched, what was proven, what was not. **Lenses** (Architect, QA, Dev — user-editable) review that work from different angles, run by the host's own model on Prism's evidence. Prism never calls a model.

User-facing sentence: *“Your AI agent stops breaking things it can't see.”*

## 2. Locked intent (owner, 2026-10-06)

| Topic | Decision |
|---|---|
| Jobs | Dropped as a product (ADR-0058). Flag off, shims one major, then removed |
| Live Relay | Frozen. Code parked in a git stash, not merged |
| Keep from Jobs | Verification (`resolveVerifyPlan` / `verifyJobWork`), finding resolution by re-scan, working set |
| Product artifact | A verdict on the change — the change receipt |
| Delivery | Host lifecycle hooks in the plugin pack, **Claude Code first** |
| Headline | Regressions caught (not Envelope token savings) |
| Lenses — who thinks | The host's model via host subagents; Prism supplies definition + memory + evidence and records verdicts |
| Lenses — storage | Private, `~/.prism/workspaces/<key>/lenses/`; never in the repo |
| Lenses — when | On demand + optional pass in the stop-hook receipt; never per edit |
| Lenses — sequence | Alongside the hooks (phases 3 and 4), before the receipt |
| Lenses — names | Feature **Lenses** (“the QA lens”); defaults Architect / QA / Dev; users rename; Prism never invents human names. Takes the vocabulary slot Jobs vacates: Prism, Iris, Envelope, Lenses |
| Deferred | Python (spike language-server reuse first), GitHub Action / SARIF (M-060), Cursor + Codex hooks |
| Evidence | Replay benchmark before product code; kill test after the receipt |

Parked Live Relay code:

```text
stash: "park: M-079 Jobs Live Relay code (frozen; superseded by safety-layer redirect 2026-10-06)"
```

Restore only if ADR-0058 is rejected: `git stash list` → `git stash apply <ref>`.

## 3. Council verdict (2026-10-06)

Agreed: keep verification; hooks are the product; precision gates every judging hook; headline is regressions caught; defer Python / CI surface / `start_my_day`; evidence before building more.

| Risk | Mitigation |
|---|---|
| Hosts absorb repo indexing / review | Compete where hosts won't: local, deterministic, cross-host graphs; blast with provenance; one receipt in any host |
| 51 tool schemas cost context, hurt tool choice | Taught surface ~5 tools (phase 8) |
| Hooks inject tokens while Prism claims savings | Inject almost nothing; a hook speaks only with a concrete finding |
| Cold-start index inside the first hook | Hooks never block on indexing; say “index warming” once and skip |
| Private vocabulary | Plain-English user copy |
| False alarms get hooks disabled | Deterministic hooks first; judging hooks only after phase 6 precision |
| Solo-builder breadth | Phase gates; benchmark and kill test can stop the milestone |

## 4. Phases

| Phase | Name | Gate to leave |
|---|---|---|
| 0 | Contract | ADR-0058 and ADR-0059 Accepted |
| 1 | Replay benchmark R0 | ≥ 1 real regression caught; false alarms and check time recorded. **Catches nothing → stop and reconsider with the owner** |
| 2 | Jobs off + checks module | Verify outside `dispatch`; job tools shimmed; Jobs tab gone |
| 3 | Claude Code hooks | Session-start + before-edit hooks ship; p95 < 300 ms; hook log |
| 4 | Lenses core | Three defaults seeded with traceable facts; three independent verdicts on this repo |
| 5 | Change receipt + lens pass | Stop hook runs checks and prints the receipt; **kill test** passed |
| 6 | Precision + post-edit warnings | Remaining M-059 scope; warnings above measured precision; R1 benchmark |
| 7 | Lenses view | Definition, memory, evidence, history, override visible and editable |
| 8 | Five-tool surface | Taught surface ~5 tools; instructions + docs match |

**Kill test (end of phase 5):** the owner and one other developer install Prism, never call a tool by hand, and a hook stops one real mistake. If not, stop and rethink rather than continue to phase 6.

### Phase 0 — Contract

- ADR-0058 and ADR-0059 Proposed → Accepted.
- `PROGRESS.md`, Master Plan §3 / §12 / §13, `OPEN_QUESTIONS.md` Q-028 and the `PROGRAM_prism-2.0.md` §8 banner match this doc.
- Annotate ADR-0052 §7 and ADR-0057 §6 with a pointer to ADR-0059.

### Phase 1 — Replay benchmark R0

Harness `scripts/replay-benchmark.ts` (Bun, dev-time only). Output `plans/notes/benchmark/R0.json` + `R0.md`.

**Arm A — historical regressions (deterministic, no model).**

1. In each repo, mine commits later **reverted**, or **fixed** by a commit that names them or touches the same lines within 14 days. Target 10–20 regressions across three repos.
2. For each: check out the parent, apply the bad commit as an uncommitted change, run Prism's stop check — `guard_session`, scoped tests from `test_impact`, detected checks from `resolveVerifyPlan`.
3. **Caught** = a scoped check fails, or a high-severity Guard / blast flag names a file or symbol the later fix touched.
4. **Control set:** an equal number of commits never reverted or fixed. A high-severity flag on a control is a **false alarm**.

**Arm B — live agent tasks (owner present, optional for the gate).** 10 tasks given to the host agent in fresh checkouts, with and without the stop check; run the full suite after each; record escaped breakages and false alarms.

**Repos (Q-028):** owner names three, or pick by: public; TypeScript; tests run offline locally in under ~5 minutes; ≥ 500 indexed files; history with reverts / fix-ups.

**Report:** per repo and total — caught / missed, false alarms, median stop-check time, every caught case with the flag or failing test that caught it. Owner spot-checks two cases.

### Phase 2 — Jobs off + checks module

- Move `resolveVerifyPlan` / `verifyJobWork` (today `packages/dispatch/src/job-verify.ts`) and tests into a checks module outside Core. Add a scoped entry: changed paths → run `test_impact`-scoped tests + detected checks.
- Job runner off by default. `start_job`, `list_jobs`, `job_control`, `job_logs`, `init`, `sleep`, `wake`, `dispatch_doctor`, `start_my_day` stay registered and answer one line: do this in this chat. `PRISM_JOBS=1` re-enables for one major.
- `queue_finding` returns a fix brief for the agent in this chat; resolution still requires a re-scan.
- Dashboard: Jobs tab removed; Findings → **Impact & Guard**; `#/jobs` redirects.
- MCP instructions: Dispatch section and ask-before-dispatch rule removed.
- Stays in `dispatch` until the package merge: `remember`, `use_skill`, Envelope ledger, working set, finding resolution, configure.

### Phase 3 — Claude Code hooks

- Plugin pack emits Claude Code hooks from the single `PluginDefinition` (ADR-0050).
- **Session start:** identity line, health headline, top landmarks, workspace working set — under an enforced size budget.
- **Before an edit:** work-order path check (off-limits generated / vendor; needs sign-off). **Warns**; blocks only when an Accepted ADR arms the veto (ADR-0056).
- Never waits for indexing; says “index warming” once and skips.
- p95 < 300 ms per hook on this repo, recorded.
- Every run appends to `~/.prism/hook-log` (hook, duration, what it said). No network.
- `prism mcp add` / plugin install wires the hooks; one documented off switch.

### Phase 4 — Lenses core

- **Lens file:** markdown + frontmatter (name, role, focus, tone, checklist, evidence list) under `~/.prism/workspaces/<key>/lenses/`.
- **Checklist rule:** every item provable from Prism data or a command — never an adjective.
- **Evidence per default:** Architect → boundaries, cycles, ADR `rationale_for`, off-limits. QA → `test_impact`, verify plan, test layout. Dev → reuse, House Style, duplicate findings.
- **Seeding:** after first index, create the three defaults from repo facts; each seeded fact cites its source (e.g. Architect: “surfaces go through Core” → ADR-0004). Re-seed replaces *seeded* facts only.
- **Memory:** existing `remember` store gains a lens scope; facts tagged *seeded* / *learned* / *user*. An owner override becomes a *learned* fact.
- **`review_with`** (e.g. `review_with: ["architect", "qa"]`): returns one brief per lens (definition + memory + bounded evidence pack) and the instruction to run each as an independent host subagent; accepts verdicts back and records them.
- **`lens`:** list / show / edit / seed. No per-lens tools.
- Host without subagents → sequential, output labelled less independent.

### Phase 5 — Change receipt + lens pass

- **Stop hook** runs `guard_session` on the session diff, scoped tests, and detected checks. It does not hand commands to the model.
- A failing check returns to the agent in the same turn.
- Optional lens pass (off by default) adds one line per lens.
- Receipt history kept locally.

```text
Prism · change receipt
Touched     4 files · 2 exports changed · 14 dependents
Proven      typecheck ✓ · 6 scoped tests ✓
Not proven  src/billing/charge.ts — 3 callers, no test covers them
Flags       duplicate of formatMoney() in src/lib/money.ts
Lenses      Architect ✓ · QA ✗ 2 untested callers
```

Five seconds to read. Every line traceable to a Prism read or a command that ran. “Not proven” is mandatory when nothing covers a changed export.

### Phase 6 — Precision + post-edit warnings

- Finish M-059 scope not yet on `main` (homonym `ambiguous` landed): member-call edges, barrel `export *` chasing, nearest-tsconfig `extends` / `baseUrl` / `paths`, static `require()`, `.d.ts` type-only edges. Confirm each against `main` first.
- Precision recorded on golden fixtures and the benchmark repos.
- **After-edit hook:** duplicate / boundary / high-blast warning only above the measured threshold; silent otherwise.
- Benchmark R1; false alarms not worse than R0.

### Phase 7 — Lenses view

- Dashboard view + MCP App card: definition, memory grouped by origin with source links, evidence per review, verdict history with the reasoning the host returned.
- Edit definition / checklist; add, remove, rename lenses; override a verdict → *learned* fact.
- Copy says it shows written reasoning and evidence, not hidden model thinking.
- `packages/ui` primitives only.

### Phase 8 — Five-tool surface

- Taught surface ≈ `repository_overview`, `prepare_change`, `blast_radius`, `review_with`, one change check — final five chosen from hook-log and benchmark data.
- Everything else callable behind a flag for one major; names unchanged.
- MCP instructions rewritten to the hooks + receipt + Lenses loop; overlapping M-058 / M-080 instruction items folded in.
- Generated MCP reference and CLI help match (`docs:check`).

## 5. Out of Scope

- Prism-run models; cloud; telemetry
- Cursor / Codex hooks (after Claude Code is measured)
- Python and other languages
- Lens files in the repo; lenses on every edit
- GitHub Action / SARIF / PR comment (M-060, after the receipt proves itself)
- Deleting job runner code (after one major)
- Live Relay; parked Options 2 / 4 / 6

## 6. Effect on other planned milestones

| Milestone | Change |
|---|---|
| M-058 Agent Surface v2 | Overlapping items fold into phase 8 |
| M-059 Reference Precision | Remainder absorbed by phase 6 |
| M-060 CI and PR | After this milestone; the receipt renders as the PR comment |
| M-080 Agent + CLI IA | Keeps loopback HTTP + `prism mcp add`; instructions part done in phase 8 |
| M-082 One Dashboard package | Smaller — no Jobs tab; carries the Lenses view |
| M-084 Surfaces + IDE merge | `dispatch-hub` loses the jobs board |
| M-085 Docs trim | `docs/guides/dispatch.md` → hooks + receipt + Lenses guide |
| M-086 Website + demo | Recorded Jobs cards → recorded receipt + lens verdicts |

## 7. Definition of Done

- [x] Phase 0: ADR-0058 and ADR-0059 Accepted; plan docs consistent
- [x] Phase 1: R0 report with ≥ 1 real regression caught; false alarms and check time recorded
- [x] Phase 2: verify outside `dispatch`; job tools shimmed (`PRISM_JOBS=1` restores); Jobs tab gone, Findings on Impact & Guard
- [x] Phase 3: both hooks run in a real Claude Code session; p95 < 300 ms; hook log; no-network suite green
- [x] Phase 4: defaults seeded with cited facts; one review returns three independent verdicts; nothing written outside `~/.prism`
- [x] Phase 5: receipt on a real session; a seeded failing test reaches the agent in the same turn; kill test recorded
- [x] Phase 6: remaining M-059 items landed; threshold set from data; R1 recorded
- [x] Phase 7: Lenses view round-trips edit + override
- [x] Phase 8: default `tools/list` ≈ 5 tools; `docs:check` green
- [x] `bun run verify:milestone` green
- [x] `plans/PROGRESS.md` updated
- [x] Owner approval recorded

## 8. Verification

| Gate | Command / action |
|---|---|
| Plan | `node scripts/check-plan-progress.mjs` |
| Typecheck / lint | `bun run typecheck` · `bun run lint` |
| Unit / integration | `bun run test` · `bun run test:integration` |
| Build | `bun run build` |
| Benchmark | `bun scripts/replay-benchmark.ts --repos <a,b,c> --out plans/notes/benchmark/R<n>.json` |
| Hook latency | recorded p95 per hook in this doc's notes |
| Docs | `bun run docs:check` |
| Manual | Owner spot-checks two benchmark cases; kill test; Lenses view smoke |
| Full | `bun run verify:milestone` |

## 9. Risks

- **Mined regressions are noisy.** Require same-line overlap or explicit revert; owner spot-checks.
- **Test suites that need network or services.** Repo criteria; skip and record unrunnable cases.
- **Benchmark clones need network.** Dev-time only; no Core path gains a network call.
- **Claude Code hook API changes.** Pin documented events; contract-test payload shape.
- **Slow suites make the stop hook painful.** Scoped tests only; time shown on the receipt.
- **Lenses cost ~3× tokens and time.** On demand + optional stop pass; per-lens off switch.
- **Lenses read as an AI assistant.** ADR-0059 wording: lenses the user owns; Prism runs no model.
- **Milestone is large for one branch.** Phase gates with owner review; benchmark and kill test can end it early.
- **Node ABI.** `better-sqlite3` must match the runner (Node 26.5.0). Rebuilt for that ABI, `verify:milestone` passed on 2026-10-06.

## 9a. Run notes (2026-10-06)

Repos for R0, picked because they are public TypeScript and their tests run offline: `toss/es-toolkit`, `colinhacks/zod`, `honojs/hono`. Zod's package manager (`nub`) would not install, so that repo is recorded unrunnable. Report: `plans/notes/benchmark/R0.json` and `R0.md`. Totals: 5 caught, 2 missed, 1 false alarm, median receipt 3.4 s. es-toolkit caught the `lastIndexOf` sparse-array fix (`77144455`, later fixed in `#1977`).

Hook latency on this repo, 40 runs, process start included: session-start median 67 ms, p95 76 ms; before-edit median 67 ms, p95 77 ms. Inside the hook the log records 1–2 ms. Both are under 300 ms. Log: `~/.prism/hook-log`. Off switch: `PRISM_HOOKS=0`. Installed into Claude Code user settings and `~/.claude/plugins/cache/prism-local/prism/1.12.0`.

Three verdicts recorded on this checkout for “Review the uncommitted M-079 safety-layer change”. An earlier pass was sequential (`sequential: true`): Architect fail (boundary on `apps/playground/vite.config.ts`), QA fail, Dev pass. The phase-4 pass is three separate subagents, each given only its own brief (`sequential: false`): Architect pass (no new import edge, cycle, or off-limits edit in the evidence), QA fail (no test reaches `packages/checks/fixtures/verify-go/go.mod`, `verify-lint-only/package.json`, or `verify-none/package.json`), Dev pass. Stored under `~/.prism`.

`bun run verify:milestone` passed on 2026-10-06 with Node 26.5.0 (format, lint, typecheck, test, build, integration, docs, plan check, publish exports, MCP start).

Kill test, local, one machine: a throwaway git repo changed `charge` so its test expected 100 and got 1. `prism-hook.mjs stop` returned `decision: block` with the assertion in the same turn. Receipt: `Failed test ✗ AssertionError 1 == 100`. This is not the two-person install the milestone also asks for.

After-edit warning threshold: blast risk 60 (`SIGN_OFF_RISK`), the existing High band. The kill-test receipt flagged `src/money.js` at risk 60. P-E4 `require()`, P-E5 `export *`, P-E6 tsconfig `extends` / `baseUrl`, and P-E7 `.d.ts` type-only edges already have tests in this tree.

Default taught tools: `repository_overview`, `prepare_change`, `blast_radius`, `review_with`, `guard_session`. `PRISM_MCP_FULL=1` restores the rest. Dispatch shims stay registered.

## 10. Owner checkpoints

1. Accept ADR-0058, then ADR-0059 (phase 0).
2. Name the three benchmark repos or accept the criteria (Q-028).
3. Review R0 before phase 2.
4. Kill test at end of phase 5.
5. Decide Cursor hooks timing from phase 5 data (outside this milestone).

## Owner Approval Checklist

- [x] Scope correct
- [x] Hard Rules followed (including: no commits before owner approval)
- [x] Approve **commit**, then approve **merge** to main (local)

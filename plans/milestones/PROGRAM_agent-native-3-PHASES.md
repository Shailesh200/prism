# Agent-native — three owner prompts

| Field | Value |
|---|---|
| Status | **Phase 2 milestones complete** — M-073→M-074 merged 2026-09-17. T1 passed 2026-09-16; T2 proof still to run. Awaiting **go ahead with phase 3**. |
| Date | 2026-09-11 |
| Product contract | [`PROGRAM_agent-native-iris.md`](./PROGRAM_agent-native-iris.md) (what we are building) |
| This file | How to build it in **three owner prompts**, with verify-plan, proof, and smoke |
| T0 proof | [`../notes/AGENT_NATIVE_PROOF_T0.md`](../notes/AGENT_NATIVE_PROOF_T0.md) |
| Does **not** | Reopen Q-009, write a cloud ADR, stack branches, commit without owner, edit `PROGRESS.md` until the first engineering milestone is opened |

**How you use this:** say `go ahead with phase 1`, then later `go ahead with phase 2`, then `go ahead with phase 3`. After the third, every planned local feature is live. Cut 4 (cloud / paid) stays discussion.

**How engineering uses this:** each phase is several git milestones. **One branch at a time** from latest `main`. `bun run verify:milestone` before every owner review. Do not implement the whole phase on one branch.

```text
You:  go ahead with phase 1
Agent: M-069 → owner commit/merge → M-070 → … → M-072 → T1 proof
You:  go ahead with phase 2
Agent: M-073 → … → M-074 → T2 proof
You:  go ahead with phase 3
Agent: M-075 → M-076 → T3 proof
```

---

## 0. Locked additions (this session)

| Topic | Decision |
|---|---|
| Verify-plan | **Do not assume `typecheck`.** Detect what this repo actually runs. Run only those. If nothing is found, status `skipped`, UI **—** everywhere (not Failure, not `0`, not a fake Success). M-056. |
| Three prompts | Phase 1 = Cut 1. Phase 2 = Cut 2. Phase 3 = Cut 3. |
| Proof | T0 captured 2026-09-11. Replay the same probes after each phase. |
| Living markdown | Still **never** written into the checkout (`~/.prism` only). |

---

## 1. What “live” means after three prompts

One loop, not twelve SKUs:

1. Agent calls **one** `prepare_change` (pack + reuse + House Style). Pipe is honest. Refs do not merge homonyms. Edges are tagged.
2. Teammate edits. **Verify-plan** runs *this repo’s* checks (lint and/or test and/or typecheck, or Go/Python equivalents). Nothing found → **—**.
3. Human opens **Guard** and reads the 3% that can hurt.
4. A health finding can become a job; it is resolved only when a **re-scan** drops the fingerprint. Pulse count moves.
5. After compaction, **working set** restores the neighborhood.
6. **Living AGENTS.md** in `~/.prism` stays true or `--check` fails.
7. Bloat is a finding. Pulse shows **job** tokens (dollars only if a local price table exists, `estimated`).
8. Symbol notes and ADR edges exist. Work order is advisory (`order` filled; hook veto only if that ADR is accepted).

Still true: local, no Prism account, not an LLM product, Q-009 closed, Q-010 phone-home absent, Envelope ledger never uploaded.

---

## 2. Verify-plan (bug → contract)

### 2.1 Bug (measured T0)

`verifyJobWork` always runs `bun run typecheck` then `bun run test`.

A repo with only `lint`, or with no scripts, gets **exit 1**. Console shows **Failure**.

Worse: `bun run test` with no `scripts.test` can invoke **`/bin/test`**.

This Prism repo has `typecheck` + `test` + `lint`, so we never see it here. Fixtures must.

### 2.2 Algorithm (`resolveVerifyPlan(cwd) → VerifyPlan`)

**Never spawn a command until the plan says it exists.** Parse first.

```text
VerifyStep =
  | { name, kind: "package-script", script }   // bun/npm/pnpm/yarn run <script>
  | { name, kind: "argv", argv: [bin, ...args] } // fixed tuple only

VerifyPlan = {
  steps: VerifyStep[]          // may be empty
  absent: { name, reason }[] // considered, not found
  source: "package.json" | "pyproject" | "go.mod" | "Cargo.toml" | "none"
  provenance: "measured" | "unavailable"
}
```

**Step A — Node / Bun** if `package.json` exists:

1. Parse `scripts`. Ignore keys matching `/watch|fix|dev|start|install|prism/i` or `lint:fix`.
2. Pick **at most one** per family, first hit in this order:

| Family | Script names (first existing wins) |
|---|---|
| typecheck | `typecheck`, `types`, `check:types` |
| lint | `lint`, `lint:check`, `oxlint` |
| test | `test`, `test:unit`, `test:ci` |

3. Package manager for `package-script`: `bun.lock`/`bun.lockb` → `bun run`; else `pnpm-lock.yaml` → `pnpm run`; `yarn.lock` → `yarn`; else `npm run`. **Do not** use a generic `bun run test` fallback that can hit `/bin/test`.
4. Do **not** invent `moon run :typecheck` unless that string is the script body of a detected key. If `scripts.typecheck` is `"moon run :typecheck"`, that is a normal package-script.

**Step B — if Node produced zero steps, try other manifests** (still allowlisted argv, not a shell string from the user):

| Detect | Step |
|---|---|
| `go.mod` | `{ name: "test", kind: "argv", argv: ["go", "test", "./..."] }` |
| `Cargo.toml` | `{ name: "test", kind: "argv", argv: ["cargo", "test", "--offline"] }` only if `cargo` exists on PATH; else absent, not failed |
| `pyproject.toml` with `[tool.pytest]` **or** `pytest.ini` | `{ name: "test", kind: "argv", argv: ["python", "-m", "pytest", "-q"] }` if `python`/`python3` exists |
| `Makefile` with a `test` target | **not in v1** (arbitrary Make is a shell). Record `absent: makefile-not-in-allowlist` |

**Step C — empty plan:**

```text
status = "skipped"
detail = "No checks to run."
provenance = "unavailable"
```

UI **—**. Chat must not say failed / passed / NA.

**Step D — run** (existing `verifyJobWork` loop):

- Run `steps` in order: typecheck → lint → test (families that exist).
- First real failure → `failed` + firstFailureLine.
- Interrupted (SIGTERM polite quit) → retry once, then `skipped` (already shipped).
- Missing binary for argv (`ENOENT`) → that step is **absent**, not failed; continue. If all remaining absent → skipped / —.
- **Script not found** / `/bin/test` fallthrough: treat as **absent** if it slipped through, never failed. Add a detector test so this cannot regress.

**Not configurable by the user** (ADR-0041): no extra script names, no `verify: ["custom"]`. Allowlist is the product.

### 2.3 Persistence and UI (“— everywhere”)

| Surface | Today | After |
|---|---|---|
| `JobRecord.verification` | `passed \| failed \| skipped` | same enum. Empty plan = `skipped` |
| `JobRecord.verificationDetail` | “typecheck failed” | “lint passed.” / “No checks to run.” |
| `JobRecord.verifyPlan` | missing | optional DTO: steps ran + absent |
| `verifyTag` | Success / Failure / **NA** | Success / Failure / **—** |
| Settings copy | “Run typecheck and tests…” | “Run this repository’s checks after a teammate stops” |
| Worker prompt | “Prism runs typecheck and tests” | Inject the resolved plan names, or “Prism found no checks — it will not fail the job for that.” |
| `verificationFixExtra` | “make typecheck and tests pass” | “make these checks pass: …” from the plan that failed |
| MCP `list_jobs` / toasts | Failure on skip | never Failure for skip |
| Pulse / Board / List / Focus / export | NA | **—** for skipped/undefined verify |

`timelineRepoStatus` “NA” for **no jobs** is a different cell; leave it unless it is a verify chip.

### 2.4 Files (V-DETECT — first slice of M-069)

| Path | Change |
|---|---|
| `packages/dispatch/src/job-verify.ts` | `resolveVerifyPlan`, extend runner for argv, never call missing scripts, empty → skipped |
| `packages/dispatch/src/job-verify.test.ts` | **new** (or extend `job-handoff.test.ts`): lint-only, none, typecheck+test, go.mod, script-not-found ≠ failed |
| `packages/dispatch/src/types.ts` | `verifyPlan` optional on `JobRecord` |
| `packages/dispatch/src/worker.ts` | prompt from plan |
| `packages/dispatch/src/runtime.ts` | persist plan; reverify re-resolves |
| `packages/dispatch-hub/src/dashboard/fleet.ts` | `verifyTag` → `—`; copy “verify NA” |
| `packages/dispatch-hub/src/dashboard/fleet.test.ts` | label `—` |
| `packages/dispatch-hub/src/dashboard/settings-view.tsx` | copy |
| `packages/dispatch-hub/src/dashboard/console-toast.tsx` | skip ≠ failure toast |
| `packages/mcp-server/src/instructions.ts` | “typecheck and tests” → “this repo’s checks” |
| `packages/mcp-server/src/instructions.test.ts` | match |
| `packages/mcp-server/src/dispatch-registry.ts` | `verify` describe string |
| Fixtures | `packages/dispatch/fixtures/verify-lint-only/package.json` |
| | `packages/dispatch/fixtures/verify-none/package.json` |
| | `packages/dispatch/fixtures/verify-go/go.mod` + `hi.go` (no test files still means `go test` is the check; keep a passing `TestHi`) |

### 2.5 Tests (must all exist)

1. lint-only `package.json` → plan `{ lint }`, `run` sees only `lint`, status passed if lint ok.
2. `{}` scripts + no go/cargo/py → skipped, detail “No checks to run.”
3. typecheck script missing, test present → do not call typecheck; run test.
4. typecheck present and compiler error → failed, not skipped.
5. `bun run test` must **not** be used when `scripts.test` is absent (guard against `/bin/test`).
6. `go.mod` fixture → argv `go test ./...` if `go` exists; if `go` ENOENT → skipped —, not failed.
7. `verifyTag("skipped")` and `verifyTag(undefined)` → `{ label: "—", tone: "neutral" }`.
8. `enabled: false` still skipped “Checks are turned off.”

### 2.6 Smoke (owner, 5 min)

1. Open Console List on a **lint-only** fixture job (or `verifyJobWork` in a unit test log). Chip is **—** or Success from lint — never Failure from missing typecheck.
2. Prism repo job still runs typecheck then test (both exist).
3. Chat after a no-check repo: “checks: —”, never “verification failed”.

---

## 3. Proof protocol (T0 → T3)

### 3.1 Two kinds of “demo job”

| Kind | What | When |
|---|---|---|
| **A. Probe (no LLM)** | Core/MCP + `verifyJobWork` on fixtures. Deterministic. | Every milestone + phase gate |
| **B. Teammate (optional)** | `start_job` on the **Envelope fixture repo**, not on Prism product source | Phase 1 gate, owner present |

Do **not** start a Dispatch worker against `/Users/shaileshjha/Prism` as the proof. That pollutes the product tree. Fixture path: `packages/intelligence/fixtures/m070-envelope/` (created in M-070; T0 uses this repo + verify fixtures only).

### 3.2 Probe script (M-069 delivers)

`scripts/agent-native-proof.ts` (Bun). Writes `plans/notes/proof/T{n}.json`.

```text
usage: bun scripts/agent-native-proof.ts --tag T0|T1|T2|T3 --workspace <abs>

Always:
  1. search_symbols { pattern: "e", limit: 50 } → envelope
  2. JSON byte length of that response
  3. resolveVerifyPlan(workspace) + resolveVerifyPlan(verify-lint-only) + verify-none
  4. capabilities: whether prepare_change / guard_session / … listed
  5. If prepare_change exists: call { task: "add caching to fetchUser" } on envelope fixture
  6. If guard_session exists: call on a dirty-session fixture
  7. If agents_md exists: generate + check (writes only ~/.prism)
  8. Console Iris: cannot screenshot from the script; print a checklist

Exit 0 always at T0 (records lies). After Phase 1, `--expect-honest` fails the script if truncated is false on pattern "e".
```

T0 numbers are already in [`AGENT_NATIVE_PROOF_T0.md`](../notes/AGENT_NATIVE_PROOF_T0.md). The script must reproduce them on this repo until M-069 S1 lands.

### 3.3 Scoreboard (fill after each phase)

| Probe | T0 | T1 (phase 1) | T2 | T3 |
|---|---|---|---|---|
| `search_symbols` `"e"` truncated | `false` (lie) | `true` + real `totalCount` | same | same |
| Verify lint-only | would **Fail** | lint ran / Success | same | same |
| Verify none | would **Fail** if package.json `{}` | **—** | same | same |
| `prepare_change` | missing | pack+reuse+exemplars, no bodies | + workingSet maybe null | + order |
| `#/iris` map | **mounted** | gone; Repos ▾; Envelope rows | + AGENTS preview optional | + rationale on pack |
| Finding resolve | job-done ≠ graph | re-scan required | + bloat types | same |
| Guard | missing | session ranked hunks | same | same |
| Living AGENTS.md | missing | — | `~/.prism/.../agents.md` | same |
| Working set | missing | — | files+neighbors after fake compaction | same |
| Job cost Pulse | per-job tokens only | same | aggregate chart | same |
| Work order | null | `order: null` reason | same | filled, advisory |

**T1 confirmed 2026-09-16** — `bun scripts/agent-native-proof.ts --tag T1 --expect-honest` exits 0. Measured (`plans/notes/proof/T1.json`): `search_symbols "e"` → `items: 50`, `totalCount: 60`, `truncated: true`; verify-plan on this repo → `[typecheck, lint, test]`, on the lint-only fixture → `[lint]`, on the none fixture → `[]` (—); `TOOL_NAMES` includes `prepare_change`, `guard_session`, `queue_finding` (all `true`) while `working_set` / `agents_md` / `work_order` are still `false` (Phase 2/3, not yet built — correctly absent). `#/iris`'s `intelligence-view.tsx` has zero `RepositoryMapView` references (map is gone). Owner still needs to eyeball `#/iris`, Guard, and Findings live per the smoke script in §8.

### 3.4 What we are optimizing (the hype demo)

Same four beats as the product story. T0 cannot do 2–4.

1. **Pipe:** pattern `"e"` must admit truncation. Bytes kept vs dump on Iris after ledger exists.
2. **Prepare:** “add caching to fetchUser” on the fixture returns feature files + tests + existing cache helper, **zero file bodies**.
3. **Guard:** 20-file dirty fixture → 2 high-blast hunks first.
4. **Loop:** unused-export finding → queue → (stub or worker) → verify-plan → re-scan → fingerprint gone **or** still open.

---

## 4. Phase 1 — say `go ahead with phase 1`

**Product:** Envelope + House Style + Finding Loop + Guard + verify-plan.  
**Ship gate:** Pulse finding count can move; `prepare_change` does not dump the repo; Guard ranks a vibecode session; missing checks show **—**.

**Milestones in order:** M-069 → M-070 → M-071 → M-072.

**First calendar day:** audit M-058 / M-059 vs `main` (do not stack on old branches). Record leftovers in `plans/notes/M-069-audit.md`. `search_symbols` honesty is **not** done (T0). Homonym `ambiguous` may already exist in `findReferences` — confirm goldens.

### 4.1 M-069 — Agent substrate + verify-plan + Iris

**Branch:** `milestone/M-069-agent-substrate` from latest `main`.  
**Depends:** M-068 Verified.  
**Packages:** `mcp-server`, `shared`, `intelligence`, `analyzer`, `impact`, `core`, `dispatch`, `dispatch-hub`.

#### S1 — Honest pipe (search_symbols + any remaining M-058)

**Implementation:**

1. Change `searchSymbols` in `packages/intelligence/src/semantic/build.ts` to count matches **before** `slice`. Return `{ items, totalCount }` (new type `SymbolSearchResult`). Keep hard cap `SEARCH_SYMBOLS_MAX = 50` on `items`.
2. `packages/core/src/workspace.ts` `searchSymbols` return type follows. Update `api-surface.test.ts` and any CLI wrapper.
3. MCP `packages/mcp-server/src/tools/graphs.ts`: `totalCount` from Core, `truncated: items.length < totalCount`. **Delete** the `truncated: false` stamp.
4. Contract test: fixture KG with 60 matching names → `items.length === 50`, `totalCount === 60`, `truncated: true`.
5. Audit other list tools for the same lie (grep `truncated: false`). Fix any MCP tool that stamps false after a slice.
6. Ledger writer (S5) records this call.

**Do not** raise search_symbols max to 500 in this milestone (agents would drown). Other graph tools already use `boundList` (max 500).

#### S2 — True Refs (M-059 leftovers)

Goldens (create under `packages/intelligence/fixtures/` if missing on `main`):

| ID | Fixture | Assert |
|---|---|---|
| P-A3 | two `fetchUser` in different files | `findReferences({ name })` → `ambiguous: true`, no merged refs |
| P-A4 | `obj.method()` / optional chain | call edge `via: "member"` |
| P-E4 | `require('./x')` | edge kind `require` |
| P-E5 | barrel `export *` | blast / refs reach defining module |
| P-E6 | tsconfig `extends` + `paths` | import resolves |
| P-E7 | import from `.d.ts` | `typeOnly`, non-runtime blast lane |

Deep-TS spike: **out of M-069** if not already on main (program: no adoption). If ADR-0034 is still Proposed, leave it.

`plans/notes/M-059-precision.md`: write precision/recall from goldens (counts, not vibes).

#### S3–S4 — Honest Edges

**DTO** (`packages/shared`): on import / call / feature-membership edges:

```text
provenance: "measured" | "heuristic" | "inferred"
```

| Tag | When |
|---|---|
| measured | static import / require string resolved to a file we indexed |
| heuristic | alias / barrel chase / tsconfig path |
| inferred | feature membership, similar-by-name, anything not a parsed edge |

MCP graph tools and later `prepare_change` include the tag. Instructions: inferred is not load-bearing without opening the file (`packages/mcp-server/src/instructions.ts`).

Tests: one fixture import = measured; one feature-membership = inferred.

#### S5 — Envelope ledger

**Path:** `~/.prism/envelope-ledger.jsonl` (`PRISM_HOME` override). Workspace is tagged on the line so Iris can still filter. Older `{repo}/.prism/envelope-ledger.jsonl` is a read-only fallback. Never uploaded. Not markdown.

Each Intelligence MCP success appends:

```text
{ ts, tool, itemCount, totalCount, truncated, limit, jsonBytes }
```

**Forbidden in the line:** prompts, paths, file bodies, code. `no-network` tests still pass. Never upload.

Hub reads this file for Iris metrics (S6). Missing file → copy “no Envelope sessions this week”, **not** `0%`.

#### S6 — Console `#/iris`

**File:** `packages/dispatch-hub/src/dashboard/intelligence-view.tsx`

- **Remove** `RepositoryMapView`.
- Keep health / testing / landmarks facts for the **filtered** repo.
- Toolbar: existing `RepoSelect` **above** Envelope.
- Envelope scoreboard (filtered repo only): bytes kept vs dump, Δ vs last week, follow-through, ≤5-call habit, list/truncated counts. **No REPO column.**
- Follow-through: of calls with `truncated: true`, share whose **next** Intelligence call in the same session window added `path` / tighter pattern / `find_symbol` / smaller limit — not `limit: 500`. Heuristic session gap: 30 minutes. Provenance **heuristic** on follow-through; bytes ratio **measured**.
- Pixel-perfect vs approved Stitch frame `6fc2ccb3f5984e6da89ca7e011eae746` (see `STITCH_AGENT_NATIVE.md`). Tokens.css, 4/8/16/24/32, screenshot DoD 1440 and 1280.
- Amend ADR-0052 §4 **in this milestone** (owner override already locked): Console Iris does not mount the map.

#### S1+S5 session artifact

Record one MCP sequence (≤5 calls) to orient + `review_changes` on a known dirty path. Save under `plans/notes/M-069-session.md`. Tools must exist and be bounded.

#### M-069 verification

```bash
bun run verify:milestone
```

Plus: proof script `--tag T0` still allowed; `--expect-honest` must **fail** until S1 is in, then **pass**.

**Smoke (owner):**

1. `#/iris` — no map; Repos ▾; empty ledger copy has **—** / “no sessions”, never `0%`.
2. MCP `search_symbols` pattern `"e"` → `truncated: true`.
3. Lint-only fixture verify → not Failure.

**Stop.** Owner commit/merge. Then M-070.

---

### 4.2 M-070 — `prepare_change` (pack + reuse + House Style)

**Branch:** `milestone/M-070-prepare-change` from updated `main`.  
**Depends:** M-069 merged.

#### Shared DTO (`packages/shared`) freeze names here

```text
ContextFile     { path, symbols[], why[], tokenWeight, provenance }
ContextPack     { task, files: ContextFile[], tokenEstimate, tests[], truncated, totalCount }
ReuseHit        { path, symbol, kind, score, evidence, provenance }
Exemplar        { path, symbol, patternId, whyCanonical }
PrepareChange   {
  pack, reuse,
  conventions: Exemplar[] | null,
  order: null,                    // reason: "not in this build"
  workingSet: null,               // same
  generatedAt, indexIndexedAt
}
```

**Composition:** one tool, never two. Null fields present with reason.

#### P1 — Pack ranker (`packages/intelligence/src/prepare/pack.ts`)

```text
score(file) =
  0.35 * featureMembership(task, file)     // 1 if member of inferred feature matching task tokens
  + 0.25 * (1 - min(depDistance, 6) / 6)    // from task seed file(s)
  + 0.15 * (testImpact(file) ? 1 : 0)
  + 0.10 * ownershipHot                     // git blame concentration 0..1
  + 0.15 * recentChurn                     // normalized commits 14d
```

- Seed files: `search_symbols` / `find_symbol` on task identifiers + `list_features` name overlap. If ambiguous symbol → return `ambiguous` **on the PrepareChange** (or pack-level flag), **do not pick**.
- `tokenWeight`: estimated tokens of `path + symbol names + why[]` (tiktoken-free: `Math.ceil(chars/4)`). **Not** file body.
- Greedy fill until `tokenEstimate >= budget` (default **4000** map tokens, P-Q1). Then `truncated: true`, `totalCount` = files that scored above threshold.
- `tests[]`: `test_impact` paths for pack files, included with their own weight.
- Provenance: score is **heuristic**; feature membership from graph is **inferred**; import distance **measured** if import edges exist.

**Guardrail P7:** serializer for MCP/CLI **must not** include file contents. Contract test greps the JSON for a unique string that only exists in a fixture body — must be absent.

#### P2 — Reuse First

Extend `findSimilar` (`explorer/report.ts`) from “similar to this symbol” to **query-by-intent**:

1. Tokenize task (`cache`, `fetchUser`, `route`, …).
2. Candidate exported symbols whose name / feature overlap.
3. Same scoring family as `findSimilar` (name 0.55, kind 0.15, feature 0.25). Threshold 0.55.
4. Prefer symbol already imported in the seed file (stdlib/deps).
5. Empty list + `provenance: unavailable` when none — **never** invent a symbol.

Fixture: helper `lruCache` exists → hit. Fixture with no helper → `reuse: []`.

#### H1–H2 — House Style (`conventions`)

Not Envelope. Same call.

1. Detect stack via existing DNA / `stack_profile` (Express, Next, etc.).
2. Pattern ids: `route-handler`, `screen`, `colocated-test`, `worker`.
3. Three exemplars: **canonical** (most inbound refs of that pattern), **recent** (newest git), **older**.
4. One-line `whyCanonical` (e.g. “handlers next to the route”).
5. Fixture: “add an Express route” → existing handler path is canonical. **Assert layout with a fixture test**, not an LLM.

If stack unknown: `conventions: []` with provenance unavailable, not fake exemplars.

#### P3–P5 — Core, MCP, CLI, Dispatch inject

| Surface | Work |
|---|---|
| `core.prepareChange({ task, budget? })` | `packages/core/src/workspace.ts` |
| MCP `prepare_change` | `packages/mcp-server/src/tools/` new file; Dispatch injection is **not** this tool’s job |
| CLI `prism prepare --json` | `packages/cli` registry |
| `start_job` | `packages/dispatch/src/runtime.ts` — when Iris indexed, prepend pack+reuse+conventions to worker prompt. Worker still has no shell. |

Inline chats call MCP themselves (M-058 instructions). Update `instructions.ts`: hero tool `prepare_change` before dump tools.

#### P6 — Iris facts block

Under the filtered repo on `#/iris`: last `prepare_change` task, pack files + why, reuse list or empty, True Refs resolved/ambiguous, Honest Edges counts. **Not** a map. Playground / IDE Map may highlight pack files if cheap; not required for DoD.

#### M-070 tests

1. Fixture “add caching to fetchUser” → pack contains feature files + `test_impact` tests; truncated honest if over budget.
2. Reuse hits existing helper; empty when none.
3. Ambiguous homonym → candidates, no silent pick.
4. Express route fixture → canonical handler; file layout assertion.
5. Integration: mocked `start_job` prompt contains pack paths.
6. MCP JSON has no fixture file body string.

```bash
bun run verify:milestone
```

**Smoke:**

1. `prism prepare --json "add caching to fetchUser"` on fixture (or MCP).
2. `#/iris` shows that pack after the call (ledger + last query).
3. Worker prompt on a dry-run / unit snapshot includes pack.

**Stop.** Owner commit/merge. Then M-071.

---

### 4.3 M-071 — Finding Loop

**Branch:** `milestone/M-071-finding-loop`.  
**Depends:** M-070 (finding jobs get `prepare_change` injected).

Already shipped: `origin: "finding"`, compose playbook, post-job verification, health history.

| ID | Implementation |
|---|---|
| L1 | `FindingRef` `{ id, source, title, path?, fingerprint }` where `fingerprint = hash(source + path + normalizedTitle)` (P-Q3). Persist in intelligence health history / findings store. Re-scan matches. |
| L2 | MCP `queue_finding` → `start_job` with `origin: "finding"`, `parentFindingId`, PRD from finding body. Console Findings **Fix with teammate** same payload. |
| L3 | After verification **passed**, re-run originating report. Fingerprint gone → `resolved`. Still present → stay open. **Never** resolve because the job is `done`. |
| L4 | Pulse sparkline = finding **count** from health history (measured). No dollars. |
| L5 | PRD: “fix this finding only”. |
| L6 | Spectrum dots on **playground / website / IDE Map only**. Same `queue_finding`. `#/iris` stays Envelope. |
| L7 | `prism-review-pr` + `review_changes` instructions: open findings stay open until L3; offer `queue_finding` only if the user asked to fix. |

**Verify-plan interaction:** a Python/lint-only repo must not mark the finding job **failed** when checks are —. L3 still re-scans. If checks are —, L3 still runs (index/health), not “skipped means resolved”.

**Tests:** unused-export fixture → queue → stub worker that deletes the export → verify pass → re-scan absent. Verify fail → finding stays. Spectrum and Findings create the same origin. Review of a still-fingerprinted “fix” must not say resolved.

**Smoke:**

1. Findings → Fix with teammate → job origin finding.
2. Pulse count matches report, not job status.
3. `#/iris` still has no map.

**Stop.** Then M-072.

---

### 4.4 M-072 — Prism Guard

**Branch:** `milestone/M-072-prism-guard`.  
**Depends:** M-070 (blast, similar, pack).

Session = `gitDirtyPaths − preExistingChanges` (ADR-0045 already has the subtract for jobs). **In-milestone ADR** (short): session boundary. G1.

| Check | Engine | Output |
|---|---|---|
| duplicate | `findSimilar` / reuse on new symbols | hunk flag |
| orphan | `safeDelete` inverted: new file with no inbound | flag |
| boundary | DNA / package crossing vs pack / ownership | flag |
| blast rank | existing `blastRadius` on changed paths | sort “read first” |

MCP `guard_session`. IDE panel in `vscode-extension` + `cursor-extension` (host-session RPC, **no Dispatch import** in the extension — AGENTS.md). Latency budget: state ms in the ADR (e.g. debounce 300ms, blast cap 50 files).

**Tests:** fixture diff 20 files / 2 high-blast → those two first; files in `preExistingChanges` excluded.

**Smoke:** dirty the fixture, open Guard, confirm pre-existing junk is absent.

**Phase 1 gate:** run `bun scripts/agent-native-proof.ts --tag T1 --expect-honest`. Fill T1 column. Screenshot `#/iris` + Guard + Findings.

**Stop.** Phase 1 is **not** “keep coding M-073”.

---

## 5. Phase 2 — say `go ahead with phase 2`

**Product:** Living AGENTS.md, Working Set, Bloat, Job Cost.

### 5.1 M-073 — Living AGENTS.md + Working Set

**Branch:** `milestone/M-073-agents-md-working-set`.

#### Living AGENTS.md

| ID | Detail |
|---|---|
| C3 | `prism agents-md generate` writes **only** `~/.prism/workspaces/<id>/agents.md` (ADR-0054 workspace key). Read `{repo}/AGENTS.md` as input if present. **Never write** repo markdown, `{repo}/.prism/*.md`, `--also claude`, or copy-into-repo. |
| Content | Template from Iris: features, import boundaries (cycles), test locations, owners. No LLM prose. |
| C4 | `prism agents-md --check` reads `~/.prism`, compares claims to `dependency_cycles` / `list_features`. CI fails on a false claim. Fixture: invert a cycle claim. |
| C5 | MCP `agents_md` `{ action: "generate" \| "check" }`. Resource `prism://agents-md`. |

Worker / MCP instructions: consume `prism://agents-md`, do not expect a generated root file.

#### Working Set

```text
WorkingSet { jobId?, files[], symbols[], decisions[], neighbors[] }
```

| ID | Detail |
|---|---|
| W1 | Persist on `JobRecord`. Update when the worker cites/writes paths (from review files + log cited paths, bounded). |
| W2 | MCP `working_set` get/set for inline. Neighbors = 1-hop KG from files. |
| W3 | Next `start_job` / resume injects it. Distinct from `remember`. |

**Tests:** generate on this repo → git status has **no** new `AGENTS.md`; file exists under `PRISM_HOME`. Fake compaction → `working_set` returns files + neighbors.

**Smoke:** generate; open `~/.prism/workspaces/.../agents.md`; `--check`; no repo diff for markdown.

### 5.2 M-074 — Bloat + Job Cost

| ID | Detail |
|---|---|
| B1 | Finding types `duplicate_implementation`, `unused_export`, `wrapper_over_existing`. Mute list in **gitignored** `{repo}/.prism/` (runtime, not markdown). |
| B2 | Same `FindingRef` + `queue_finding` as M-071. |
| K1 | Aggregate `tokenUsage` by day / repo / model in hub snapshot (already on `JobRecord`). |
| K2 | Pulse chart **after** series exists. $ only with **local** price table; provenance `estimated`. Else tokens. |
| K3 | No Cursor/Claude JSONL. Prism jobs only. |

**Tests:** mute suppresses; Pulse tokens without price table are not `$0`.

**Phase 2 gate:** `--tag T2`. Living AGENTS.md path global. Working set after compaction. Bloat finding queues. Pulse cost series.

---

## 6. Phase 3 — say `go ahead with phase 3`

**Product:** Symbol Memory, Rationale, Work Order (advisory). Hook veto only with ADR.

### 6.1 M-075 — Symbol memory + ADR nodes

| ID | Detail |
|---|---|
| M1 | `remember` optional `symbol` / `path`. On `renameImpact`, rewrite stored ids. |
| M2 | `prepare_change` includes notes for pack files. |
| A1 | Indexer: `plans/adr/**`, `ADR-NNNN`, `WHY:` / `NOTE:` comments → `rationale_for` edges. |
| A2 | Committed text only. No PDF/image/video. |

**Tests:** remember on a symbol; rename moves it; ADR file links to a pack path.

### 6.2 M-076 — Work orders + hook

| ID | Detail |
|---|---|
| O1 | Fill `PrepareChange.order` from blast + ownership + DNA generated/vendor paths. |
| O2 | MCP `work_order`. Dispatch copies off-limits into PRD. |
| O3 | **ADR required** before IDE hook that vetoes writes. Default this milestone: **advisory only** (`needsSignOff` never blocks if ADR not accepted). |
| O4 | Stitch states allowed / blocked / needs sign-off — implement UI copy even if hook is advisory (blocked state documented as “not armed”). |

**Out of scope:** sandboxing, OS permissions, remote workers, Cut 4.

**Phase 3 gate:** `--tag T3`. `prepare_change.order` non-null on fixture with vendor path. Hook does not veto unless ADR accepted.

---

## 7. Per-milestone engineering checklist (every branch)

Copy this into the milestone PR / owner review:

- [ ] Branch `milestone/M-XXX-…` from **latest `main`**, not from the previous milestone branch
- [ ] Only this milestone’s In Scope IDs
- [ ] No Prism-written markdown in the checkout
- [ ] No Envelope ledger upload; no Q-010
- [ ] `bun run verify:milestone` green
- [ ] Fixtures for the IDs above, not an LLM judge
- [ ] Proof script or T0 probes that this milestone claims
- [ ] Owner smoke steps in this file executed
- [ ] **Stop for commit approval** (do not commit until the owner says so)
- [ ] After merge: mark Verified in `PROGRESS.md` **when owner says**, snippet of APIs/ADRs

---

## 8. Owner smoke scripts (end of each phase)

### Phase 1 (after M-072)

1. `search_symbols` `{ pattern: "e" }` → `truncated: true`, `totalCount > 50`.
2. Lint-only fixture: verify **not** Failure; none: **—**.
3. `prepare_change` “add caching to fetchUser” on envelope fixture — paths + why, reuse or empty, 3 exemplars or unavailable, **no bodies**.
4. `#/iris`: no map, Repos ▾, empty week is not `0%`.
5. Guard on a dirty fixture: pre-existing files excluded; high-blast first.
6. Finding: queue → (pass + re-scan) resolved **or** still open with evidence.
7. Optional: Dispatch job **on the fixture repo** with `placement=worktree` so the product checkout stays clean.

### Phase 2

1. `prism agents-md generate` → file only under `~/.prism`; `git status` clean of markdown.
2. `--check` fails on inverted cycle fixture.
3. Working set after simulated compaction.
4. Mute a bloat finding; Pulse tokens (no invented $).

### Phase 3

1. `prepare_change` includes a `remember` note and an ADR hit if the fixture has one.
2. `order.offLimits` includes the vendor/generated path.
3. Network unplugged: S-A–S-I still work (S-J).

---

## 9. Explicitly not in the three prompts

- Cut 4 cloud / paid / Stripe / accounts
- Reopening Q-009
- AgentsView JSONL parsers, Ponytail personality, hosted Graphify
- LSP-in-Core, vector search as default
- Unattended scheduled **edits**
- Prism-written `AGENTS.md` / `CLAUDE.md` in git
- Work-order **veto** without an accepted ADR
- Implementing all of Phase 1 on one git branch

---

## 10. Agent instruction when the owner says go ahead

When the user says **go ahead with phase 1** (and not before):

1. Treat [`PROGRAM_agent-native-iris.md`](./PROGRAM_agent-native-iris.md) + **this file** as approved for **Cut 1 only**.
2. Ask once if `PROGRESS.md` should mark M-069 `In Progress` (owner must confirm).
3. Create `milestone/M-069-agent-substrate` from `main`.
4. Implement **M-069 only** (including V-DETECT). Do not start M-070 on the same branch.
5. Run `bun run verify:milestone` and the M-069 smoke list.
6. Request owner review/commit. After merge, cut M-070, repeat until M-072, then T1 proof.

Same pattern for phase 2 (M-073 then M-074) and phase 3 (M-075 then M-076).

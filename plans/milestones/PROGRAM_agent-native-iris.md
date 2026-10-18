# Program — Agent-native Iris

| Field | Value |
|---|---|
| Status | **Cuts 1–3 done** 2026-09-17 — M-069–M-076 Verified. T1/T2/T3 proofs recorded. **Cut 4 set aside.** |
| Date | 2026-09-11 |
| Owner session | Feature catalog + confirmations (cloud/paid = discussion only; no Q-009 ADR yet) |
| Stitch | Google Stitch `10137496421656524676` — historical 15×3 mocks; product is Envelope + siblings |
| Does **not** | Reopen [Q-009](../OPEN_QUESTIONS.md), write a cloud ADR, mark any milestone `In Progress`, or commit |
| Engineering rule | One git milestone branch at a time, from latest `main`, after this draft is approved |
| Owner launch | Three prompts **done**. [`PROGRAM_agent-native-3-PHASES.md`](./PROGRAM_agent-native-3-PHASES.md). T0–T3: [`../notes/AGENT_NATIVE_PROOF_T0.md`](../notes/AGENT_NATIVE_PROOF_T0.md). Cut 4 set aside. |

This is the end-to-end plan for the **agent-native** product. **Envelope** is the agentic experience (Graphify-class query of Iris, without a dump). Other named products (Finding Loop, Guard, …) stay outside Envelope. Cuts 1–3 are **done**. A fourth cut is **set aside** (plan-only discussion for Prism Cloud and paid plans — not scheduled).

Companion catalog: the [feature catalog canvas](file://~/.cursor/projects/<project>/canvases/agentic-feature-catalog.canvas.tsx) (what / how / fits / impact). This file is the **product** contract. Execution, verify-plan, smoke, and T0–T3 proof: [`PROGRAM_agent-native-3-PHASES.md`](./PROGRAM_agent-native-3-PHASES.md).

---

## 0. Owner decisions locked in this draft

| Topic | Decision |
|---|---|
| Cloud vs Q-009 | **Do not reopen Q-009.** Sketch cloud in Cut 4 only. No ADR until owner approves after reading this. |
| What syncs | **Not decided.** Cut 4 lists the discussion. Assume “a cloud sync *could* exist”; do not design Core around it in Cuts 1–3. |
| Cloud workers | **Separate discussion.** Cuts 1–3 keep Dispatch workers on the user’s machine. |
| Paid entitlements | **Separate discussion** in Cut 4. Cuts 1–3 ship as today’s local product (MIT, no account). |
| Stitch | Historical **15 × 3** mock inventory still in Google Stitch. Product catalog is **Envelope** (five capabilities) plus the other named products. Tokens locked (ADR-0014). |
| Cuts | Cut 1 highest → Cut 2 medium → Cut 3 good-to-have → Cut 4 plan-only cloud + paid. |
| Plan home | This file under `plans/`. Master Plan / `PROGRESS.md` / `OPEN_QUESTIONS.md` stay unchanged until owner says so. |
| Envelope | **The agentic experience product.** Not five SKUs. Owner 2026-09-11: pipe + True Refs + Honest Edges + Context Pack + Reuse First are **Envelope capabilities**. Finding Loop, House Style, and Guard stay separate. |
| Living AGENTS.md | **Repo markdown ≠ Prism-written markdown.** `{repo}/AGENTS.md`, `CLAUDE.md`, and any other `.md` already in the checkout are the user’s. Anything Prism generates (Living AGENTS.md and any other briefing/report markdown) **always** lives under global `~/.prism/` (`PRISM_HOME`), never in the repo — not even gitignored `{repo}/.prism/`. No copy-into-repo flag. |
| House Style / Guard | **Cut 1** (owner 2026-09-11). Siblings of Envelope, not Envelope capabilities. Living AGENTS.md and Working Set stay Cut 2. |
| Console Iris | **No Spectrum on `#/iris`.** Owner 2026-09-11: drop `RepositoryMapView` from Dispatch Console Iris. Website / playground / IDE webview keep the map. |
| Envelope UI | Local-always ledger (never uploaded). Console Iris **Repository analysis**: **Repos ▾** above the scoreboard (same control as Dashboard). Pipe metrics + pack/reuse/refs/edges for the **filtered** repo. No REPO column, no fleet table of every indexed repo. Not Pulse (that is job LLM spend). |
| Q-010 | Phone-home / anonymous product analytics stay **absent**. Local Envelope ledger is not Q-010 telemetry. Do not edit `OPEN_QUESTIONS.md` until owner says so. |
| Verify-plan | **Do not assume `typecheck`.** Detect this repo’s checks (lint / test / typecheck / Go / pytest allowlist). If none, `skipped` and UI **—** — never Failure, never fake 0 (M-056). Never invoke a missing script (`bun run test` must not fall through to `/bin/test`). |

### Envelope — agentic experience (capabilities, not SKUs)

One product. Agents that already use Prism get all of it: Iris is indexed with precise refs and tagged edges; every MCP answer is bounded; the hero call is `prepare_change` (pack + reuse; House Style fills `conventions` on the same call).

| Capability | Job | When | Engineering |
|---|---|---|---|
| **Pipe** | Don’t drown the agent. Honest `{ items, totalCount, truncated, limit }`. | Serve time | M-058 leftovers / M-069 S1, S5–S6 |
| **True Refs** | Don’t merge two `fetchUser`s. | Index time | M-059 / M-069 S2 |
| **Honest Edges** | Don’t treat a guess as a fact (`measured` / `heuristic` / `inferred`). | Index time | M-069 S3–S4 |
| **Context Pack** | Right files for this task, token budget, no bodies. | Query (`prepare_change`) | M-070 P1, P3–P7 |
| **Reuse First** | Call what already exists; empty list if none. | Same `prepare_change` | M-070 P2 |

House Style (exemplars) fills `PrepareChange.conventions` in **Cut 1** (same `prepare_change` call). Work Order fills `order` (Cut 3, done). House Style and Guard are **not** Envelope.

**Iris tab scoreboard** (local ledger, gitignored `.prism/`): see [CONSOLE_FLEET.md](../mockups/CONSOLE_FLEET.md) §11. **Repos ▾** scopes the page; pipe metrics and pack / reuse / refs / edges are for that repo. No REPO column. Finding Loop and `prism-review-pr` are not this tab.

---

## 1. Goal

Make every agent session on a Prism workspace:

1. **Use Envelope** — precise graph, honest edges, bounded answers, pack + reuse (`prepare_change`).
2. **Follow house style** when it does write (conventions).
3. **Stay inside a work order** when we later enforce one (scoping).
4. **Survive compaction** without rediscovering the neighborhood (working set).
5. **Read instructions that are still true** (Living AGENTS.md from `~/.prism` + drift).
6. **See why a region is the way it is** (symbol memory + ADR nodes).
7. **Show the human the 3% that matters** (Guard).
8. **Turn health findings into verified jobs whose count falls** (the loop).
9. **Treat agent bloat as a finding** (over-engineering).
10. **Show teammate spend honestly** (Pulse cost, after aggregation).

Cuts 1–3 are **local-only**. Core still does not require a network. Prism is still not an LLM product. Iris still does not speak in the first person (ADR-0052).

---

## 2. How the product actually fits together (no gaps)

The named products are not unrelated tools. They are one **prepare → edit → review → verify → (optional) health loop** machine. Envelope is the prepare/query side.

```text
                    ┌─────────────────────────────────────────┐
                    │  Envelope substrate (pipe + refs + edge tags) │
                    └──────────────────┬──────────────────────┘
                                       │
  task / ticket / dirty set            ▼
           │                 prepare_change()
           │                 ┌──────── pack (files, symbols, why, tests)
           │                 ├──────── reuse (existing helpers)
           │                 ├──────── conventions (Cut 1 — House Style)
           │                 └──────── work_order (Cut 3)
           ▼
    Dispatch start_job  ── injects pack + reuse + memories + working set
           │
           ▼
    worker edits checkout / worktree
           │
           ├──── Guard (Cut 1)  — session ledger, “read this first”
           ├──── review_changes / blast / test_impact (already shipped)
           └──── job verification (typecheck + tests) (already shipped)
                       │
                       ▼
              health findings ── queue origin:finding ── re-scan ── count falls
```

**Composition rule:** agents get **one** `prepare_change` call, not five. Fields that are not in the current cut are present on the DTO as `null` with a reason (`"not in this build"`), never omitted silently. That is the same honesty stance as ADR-0029.

**Injection rule:** `start_job` always includes the latest `prepare_change` for the PRD/title if Iris is indexed (pack + reuse + conventions). The worker does not have to remember to call it. Inline chats still call the MCP tool themselves (M-058 instructions).

**Null rule:** if the index is not ready, `prepare_change` returns `PRISM_INDEX_REQUIRED` rewritten to “retry in a few seconds” (M-058 P-C7). If a symbol is ambiguous, it returns candidates — it does not pick (M-059 P-A3).

---

## 3. Shared contract (all cuts)

Add to `@repo-prism/shared` (names are proposals; freeze in the first engineering milestone of Cut 1):

```text
ContextFile     { path, symbols[], why[], tokenWeight, provenance }
ContextPack     { task, files: ContextFile[], tokenEstimate, tests[], truncated, totalCount }
ReuseHit        { path, symbol, kind, score, evidence, provenance }
Exemplar        { path, symbol, patternId, whyCanonical }
WorkOrder       { inScope[], offLimits[{ path, reason }], needsSignOff[] }
WorkingSet      { jobId?, files[], symbols[], decisions[], neighbors[] }
FindingRef      { id, source, title, path?, fingerprint }   // stable across re-scans
PrepareChange   {
  pack: ContextPack
  reuse: ReuseHit[]
  conventions: Exemplar[] | null
  order: WorkOrder | null
  workingSet: WorkingSet | null
  generatedAt, indexIndexedAt
}
```

**MCP tools (additive, never remove existing names):**

| Tool | Cut | Notes |
|---|---|---|
| `prepare_change` | 1 | The agent-facing hero. Pack + reuse + House Style exemplars; `order` fills in Cut 3. |
| `queue_finding` | 1 | Wraps `start_job` with `origin: "finding"` + `parentFindingId`. |
| `guard_session` | 1 | Current session ledger. |
| `working_set` | 2 | get / set. Dispatch also persists automatically on jobs. |
| `agents_md` | 2 | `action: generate \| check` |
| `work_order` | 3 | Also a field on `prepare_change`. |
| `remember` | 3 | Extend with optional `symbol` / `path` — do not add a second memory product. |

Existing tools stay. `review_changes`, `blast_radius`, `test_impact`, `repository_health`, `start_job` are the rest of the loop.

**Core methods:** `core.prepareChange()`, `core.queueFinding()` is **not** Core — findings live in intelligence, jobs in Dispatch. Core only produces `FindingRef[]` from health reports.

**Surfaces:**

| Surface | Role |
|---|---|
| MCP | Agent path. Bounded JSON. |
| CLI | `prism prepare`, `prism agents-md`, `prism guard`, `prism finding queue` |
| Console | Pulse / Findings / Iris. `#/iris` is indexed-repo facts + Envelope rows, not the map. |
| IDE | Guard live, work-order hook (Cut 3). Spectrum remains on playground / website / IDE Map webview. |

**Do not** put prepare/reuse logic in the MCP server or the extension. They call Core.

---

## 4. Feature → cut map

| Product | Cut | Engineering milestone | Primary human screen |
|---|---|---|---|
| **Envelope** (pipe, True Refs, Honest Edges, Context Pack, Reuse First) | **1** | M-069 then M-070 | Console Iris: filter + scoreboard + pack/reuse |
| House Style | **1** | M-070 | Same `prepare_change`: three exemplars |
| Finding Loop | **1** | M-071 | Findings + Pulse burndown; Spectrum finding layer |
| Prism Guard | **1** | M-072 | IDE Guard ledger |
| Living AGENTS.md | **2** | M-073 | Settings / CLI preview + drift |
| Working Set | **2** | M-073 | Job Focus: working set |
| Bloat Findings | **2** | M-074 | Findings: bloat |
| Job Cost | **2** | M-074 | Pulse cost (after aggregate) |
| Symbol Memory | **3** | M-075 | Inspector: note on node |
| Rationale | **3** | M-075 | Playground / IDE map: rationale_for |
| Work Order | **3** | M-076 | Work order + hook states |

**Why provenance is Cut 1:** every new tool will over-claim if edges look equally certain. Cheap, already legislated for numbers.

**Why House Style and Guard are Cut 1 (owner 2026-09-11):** writing without exemplars and reviewing without a session ledger are the same class of failure as dumping the repo. They stay **siblings** of Envelope, not capabilities of it. Living AGENTS.md and Working Set stay Cut 2.

**Why work orders are Cut 3:** advisory MCP is easy; a hook that can *veto* a write is a new IDE surface and an ADR. Shipping `order: null` on `PrepareChange` in Cut 1 avoids a second DTO later.

**Why cost is Cut 2 not 1:** `JobRecord.tokenUsage` already persists and renders on job rows. Cut 2 is aggregation + Pulse chart with estimated dollars marked `estimated`. Not a moat.

---

## 5. Cut 1 — Highest impact — **done** 2026-09-16

**Product outcome:** Envelope is live (precise graph, bounded answers, pack + reuse + House Style on one `prepare_change`); Guard ranks the session; a finding can become a verified job whose count falls.

### 5.1 First: close the substrate (existing planned work)

Before new IDs:

1. **Audit the tree vs [M-058](../archive/milestones/M-058_agent-surface.md) DoD.** `product-open-ends` claimed most P-C items are already in code while the milestone is still Planned. Either mark Verified with evidence, or finish leftovers on `milestone/M-058-agent-surface`.
2. **Audit vs [M-059](../archive/milestones/M-059_reference-precision.md).** The milestone file says implemented-uncommitted on another branch. Reconcile: cherry-pick / cut a clean branch from `main`, or finish it. **Do not stack on a dirty M-053 branch.**

Do not start M-070 until:

- MCP tools used in the recorded “≤5 calls to orient + review” session exist and are bounded.
- Homonym / barrel / member / require / tsconfig goldens exist or are explicitly wavered with a note in `plans/notes/M-059-precision.md`.

### 5.2 M-069 — Agent substrate (envelope + refs + edge provenance)

**Depends on:** latest `main` (M-068 Verified).  
**Packages:** `mcp-server`, `shared`, `intelligence`, `analyzer`, `impact`, `core`, `dispatch-hub`.

| ID | Work |
|---|---|
| S1 | Finish or verify M-058 P-C1–P-C12. Recorded agent session artifact. `search_symbols` must report honest `totalCount` / `truncated` (today it can stamp `truncated: false` after a 50-hit slice). |
| S2 | Finish or verify M-059 P-A3, P-A4, P-E4–P-E7 goldens. |
| S3 | Edge DTO: `provenance` on import/call/feature-membership edges (`measured` \| `heuristic` \| `inferred`). MCP graph + `prepare_change` include it. |
| S4 | Instructions: inferred edges are not load-bearing without opening the file. |
| S5 | Local-always Envelope ledger in gitignored `.prism/` (tool, `items` length, `totalCount`, `truncated`, `limit`, JSON bytes, timestamp). No prompts, paths, or file bodies. Never uploaded. `no-network` tests still pass. |
| S6 | Console `#/iris`: **remove** `RepositoryMapView`. Under **Repository analysis**, **Repos ▾** (Dashboard control) above Envelope. Pipe scoreboard for the **filtered** repo only (bytes kept vs dump, truncation follow-through, ≤5-call habit, week vs previous week) — **no REPO column**. Same repo still shows health / testing / landmarks facts. |
| V1 | **Verify-plan.** Resolve allowlisted checks from the repo (lint / test / typecheck / Go / pytest). Never invoke a missing script. Empty plan → `skipped`, UI **—**. See [`PROGRAM_agent-native-3-PHASES.md`](./PROGRAM_agent-native-3-PHASES.md) §2. |

**Out of scope:** Tree-sitter polyglot (M-034), deep-TS adoption beyond the existing spike ADR. No Envelope scoreboard on the website hero. No Pulse mix-in of these numbers.

**Amends at implementation (not this draft):** [ADR-0052](../adr/0052-product-identity-and-iris.md) §4 required Console and website to mount the same `RepositoryMapView`. Owner override: Console Iris does not. Website hero unchanged. Write the ADR amendment only when this milestone is approved to code.

**DoD:** `bun run verify:milestone`; goldens; one recorded MCP session; no tool removed; `#/iris` has no map, a repo filter, and Envelope metrics for the filtered repo (pixel-perfect vs the approved Stitch frame).

### 5.3 M-070 — Envelope query (pack + reuse + House Style)

**Depends on:** M-069.  
**Packages:** `intelligence`, `core`, `shared`, `mcp-server`, `cli`, `dispatch`, `dispatch-hub`.

This is still **one** `prepare_change` call. Pack + reuse are Envelope. House Style is a sibling field (`conventions`), not a fifth Envelope capability.

| ID | Work |
|---|---|
| P1 | Ranker: feature membership, dependency distance, ownership, churn, test_impact. Token budget (default ~4k tokens of *map*, not source). |
| P2 | Reuse: similar exports (extend `explore_code` similar from per-target to query-by-intent), canonical hit in the same feature, stdlib/deps already imported there. |
| P3 | `PrepareChange` DTO with `conventions` filled (3 exemplars), `order: null` (`"not in this build"`). Envelope `truncated` / `totalCount`. |
| P4 | MCP `prepare_change`. CLI `prism prepare --json`. |
| P5 | `start_job` injects pack + reuse + conventions into the worker prompt when Iris is ready. |
| P6 | Pack files + why + reuse list under the filtered repo on `#/iris` (facts block, not a map). Playground / IDE Map webview keep Spectrum if a spatial highlight is needed. |
| P7 | Guardrail: never dump file bodies through MCP. Paths + signatures + why only. |
| H1 | Pattern taxonomy per detected stack (route, screen, test, worker). Use existing route inventories. |
| H2 | Fill `PrepareChange.conventions` (canonical / recent / older) plus the one-line house rule. |

**Acceptance (must all pass):**

1. Given “add caching to fetchUser”, pack contains the feature files and `test_impact` tests, `truncated` honest if over budget.
2. Reuse returns an existing helper when `explore_code` similar would have found it; empty list with `provenance: unavailable` when none — never a hallucinated symbol.
3. A Dispatch job’s first worker prompt contains the pack (integration test on a fixture repo).
4. Ambiguous symbol → candidates, no silent pick.
5. `prepare_change` for “add an Express route” returns an existing handler as canonical; a fixture test asserts layout, not an LLM judge.

### 5.4 M-071 — Health → findings → jobs loop

**Depends on:** M-070 (so a finding job can `prepare_change` itself).  
**Packages:** `intelligence`, `dispatch`, `dispatch-hub`, `mcp-server`, `app-shell`, `ui` (Spectrum layer on playground / website / IDE map — **not** Console `#/iris`).

Already shipped: `JobRecord.origin: "finding"`, compose drawer playbook, post-job verification, health history backfill.

| ID | Work |
|---|---|
| L1 | Stable `FindingRef.id` (fingerprint of source + path + code). Re-scans match. |
| L2 | `queue_finding` MCP + Console Findings “Fix with teammate” pre-fills `origin: finding`, `parentFindingId`, PRD from finding body. |
| L3 | After verification **passed**, re-run the originating report. If the fingerprint is gone, mark finding `resolved`. If still present, keep it — do not claim success. |
| L4 | Pulse: finding-origin jobs + a **count sparkline** from health history (measured). No cost dollars here. |
| L5 | One-finding-per-job. The worker PRD says “fix this finding only”. |
| L6 | Spectrum finding layer on playground / website hero / IDE Map: dots at finding paths. **Fix with teammate** on a node calls the same `queue_finding` / `start_job` path as Findings (Envelope pack injected). Console `#/iris` stays Envelope rows — no map. |
| L7 | Inherited `prism-review-pr` + MCP `review_changes` routing: while reviewing any change, check findings on the touched paths; never treat “job done” as “finding resolved”; only resolve after L3 re-scan. Offer `queue_finding` when the author asked to fix a still-open finding. |

**Acceptance:**

1. Fixture with an unused export finding → queue → worker (or recorded stub) → verify pass → re-scan → finding absent.
2. Verify fail → finding stays, job `verification: failed`.
3. Spectrum node “Fix with teammate” and Findings “Fix with teammate” create the same `origin: finding` job.
4. `prism-review-pr` (plugin + inherited) and MCP instructions mention Finding Loop; a review of a “fixed” finding that still fingerprints must not say resolved.
5. Unattended scheduled *edits* are still out. Optional later: nightly **read-only** `repository_health` (timer) — not in this milestone.

### 5.5 M-072 — Prism Guard

**Depends on:** M-070 (blast, similar, pack already exist).  
**Packages:** `vscode-extension`, `cursor-extension`, `mcp-server`, `dispatch`, `impact`, `shared`.

House Style tells the teammate how to write. Guard tells the **human** what to read in this session. Not Envelope.

| ID | Work |
|---|---|
| G1 | Session boundary ADR (in-milestone): dirty-set minus `preExistingChanges` = session. |
| G2 | Four checks: similar-duplicate, safeDelete orphan, boundary cross, hunk blast rank. |
| G3 | IDE panel + MCP `guard_session`. “Read this first” ranked hunks. |
| G4 | Latency budget so watch does not fight the agent (state a ms budget). |

**Acceptance:** Guard on a fixture diff ranks the high-blast hunk first; session excludes files that were dirty before the agent started.

**Cut 1 ship gate:** a buyer can watch a finding count move on Pulse; an agent can `prepare_change` (pack + reuse + exemplars) without dumping the repo; Guard ranks a vibecode session.

---

## 6. Cut 2 — Medium impact — **done** 2026-09-17

**Product outcome:** instructions stay true, the teammate resumes after compaction, bloat is a finding, Pulse shows spend.

### 6.1 M-073 — Living AGENTS.md + Working Set

| ID | Work |
|---|---|
| C3 | `prism agents-md generate` writes a **derived briefing** only to `~/.prism/workspaces/<id>/agents.md` (same workspace keying as ADR-0054 jobs). Prism may **read** `{repo}/AGENTS.md` / `CLAUDE.md`. It **never writes** markdown into the checkout — not those files, not `{repo}/.prism/*.md`, no `--also claude`, no copy-into-repo flag. |
| C4 | `prism agents-md --check` (CI) fails if a derived claim is false (e.g. “no cycles in core” vs `dependency_cycles`). Check reads `~/.prism`, never a file in the git tree. |
| C5 | MCP `agents_md`. Resource `prism://agents-md`. Agents consume the briefing through MCP. |
| W1 | Persist `WorkingSet` on `JobRecord`. Update as the worker cites/writes files. |
| W2 | MCP `working_set` for inline chats. 1-hop neighbors from KG. |
| W3 | Next `start_job` / resume injects working set. Distinct from `remember`. |

**Two different trees.** Repo `.md` files are the user’s. Prism-written markdown always sits at **global** `~/.prism/` (`PRISM_HOME`). `{repo}/.prism/` stays **gitignored** runtime cache (index, Envelope ledger) — binary/state, not generated markdown. Jobs, skills, Living AGENTS.md, and any other Prism-authored `.md` live under **`~/.prism/`**.

**Acceptance:** generate on this repo writes only under `PRISM_HOME` / `~/.prism`; the git tree has no new Prism-owned path; `--check` fails if we invert a cycle claim in a fixture; after a fake compaction, `working_set` returns files + neighbors.

### 6.2 M-074 — Bloat findings + Pulse cost

| ID | Work |
|---|---|
| B1 | Finding types: `duplicate_implementation`, `unused_export`, `wrapper_over_existing`. Mute/accept list in `.prism/`. |
| B2 | Feed M-071 loop (same `FindingRef` machinery). |
| K1 | Aggregate `tokenUsage` by day / repo / model in hub snapshot. |
| K2 | Pulse chart **after** the series exists. Dollars only if a **local** price table is configured; provenance `estimated`. |
| K3 | No Cursor/Claude JSONL parsers. Prism jobs only. |

**Acceptance:** mute list suppresses a finding; Pulse shows tokens for a window; without a price table the axis is tokens, not invented dollars.

---

## 7. Cut 3 — Good to have — **done** 2026-09-17

**Product outcome:** why-notes and ADRs live on the graph; a work order can declare off-limits files; optional IDE veto.

### 7.1 M-075 — Symbol memory + ADR nodes

| ID | Work |
|---|---|
| M1 | Extend `remember` with `symbol` / `path`. Migrate on `renameImpact`. |
| M2 | `prepare_change` includes notes for pack files. |
| A1 | Indexer: `plans/adr/**`, `ADR-NNNN` mentions, `WHY:` / `NOTE:` comments → `rationale_for` edges. |
| A2 | No PDF/image/video. Committed text only. |

### 7.2 M-076 — Work orders + hook

| ID | Work |
|---|---|
| O1 | Fill `PrepareChange.order` from blast + ownership + DNA generated/vendor paths. |
| O2 | MCP `work_order`. Dispatch copies off-limits into the PRD. |
| O3 | **ADR required** before an IDE hook that vetoes writes. Advisory-only is the default if the ADR is not accepted. |
| O4 | Hook states: allowed / blocked / needs sign-off. Stitch all three. |

**Out of scope:** sandboxing, OS file permissions, remote workers.

---

## 8. Cut 4 — **Set aside** (discussion only, not scheduled)

**Owner instruction 2026-09-17:** set aside. Plan only. Do not reopen Q-009. Do not write an ADR. Do not implement.

This section is a **discussion agenda**, not a design.

### 8.1 Prism Cloud (sync)

**Candidate hosting:** Hetzner Cloud VPC already used for Cardorbit and Pulse backends. Reuse is a *possibility*, not a decision.

**Must discuss before any ADR:**

1. What leaves the machine (metadata vs index vs snippets vs source).
2. Encryption in transit / at rest; who holds keys.
3. Identity (there is no Prism account today). GitHub? email? org?
4. Threat model vs [07_THREAT_MODEL.md](../architecture/07_THREAT_MODEL.md) and M-036 (no telemetry, Q-010).
5. Console today is loopback + token. A cloud Console is a different threat surface (ADR-0043 loopback assumptions).
6. Workers: still local, or remote in the VPC? (Owner: discuss later. Default in this program: local.)
7. Multi-machine Iris: reindex vs sync snapshot.
8. Retention, export, delete-workspace (GDPR / user data).
9. Inventory of the existing VPC (Postgres? object store? existing reverse proxy?) — **unknown from this repo**. Need a one-page infra note from the owner.
10. Failure mode: Cloud down ⇒ laptop still works. If that sentence is false, Cloud is not an overlay and Q-009 must be reopened explicitly.

**Non-goals until discussed:** OAuth inside Prism for Slack/Linear (ADR-0049 still stands), unattended cloud workers, mobile PWA.

### 8.2 Paid plans

**Owner instruction:** discuss separately.

**Must discuss:**

1. Local Iris + Dispatch remain free (MIT) vs any local feature gated.
2. What the SKU is: seats, usage (tokens/job-minutes), caps (parallel jobs, retention), or feature flags (Guard hook, loop automations).
3. Billing provider (almost certainly **not** inside the Hetzner VPC app: Stripe/etc. is a separate system).
4. Entitlements in Core vs a thin license file vs Cloud-only flags.
5. How this interacts with “would we put this screenshot on prismhq.in and ask someone to pay?” (already the M-068 craft bar) — paid SKUs should not be required to *use* the instrument.

**Do not** stub Stripe, accounts, or feature flags in Cuts 1–3.

---

## 9. End-to-end scenarios (the “no gaps” tests)

These are the program’s acceptance tests. A cut is not done if its scenarios fail.

### S-A — New work, happy path (Cut 1)

1. User: “add caching to fetchUser”.
2. Agent calls `prepare_change` (or Dispatch injects it).
3. Pack lists the feature files + tests. Reuse names an existing cache helper if one exists.
4. Worker edits only pack files (honour system; enforced in Cut 3).
5. `review_changes` + verification pass.

### S-B — Ambiguous symbol (Cut 1)

`prepare_change` / `blast_radius` on a homonym returns `ambiguous: true` and candidates. No silent merge of two functions.

### S-C — Finding burndown (Cut 1)

Health finding → Console Findings **or Spectrum node** → `queue_finding` → job verifies → re-scan → finding resolved **or** remains with evidence. Pulse count matches the report, not the job status. A `prism-review-pr` pass on the same paths must not call it resolved until the re-scan.

### S-D — Compaction (Cut 2)

Job hits context limit. `working_set` restores files + 1-hop. Worker does not grep the repo from zero.

### S-E — House style (Cut 1)

“Add an API route” returns three exemplars; the worker’s new file matches the canonical layout (asserted by a fixture test, not an LLM judge).

### S-F — Vibecode review (Cut 1)

Dirty session of 20 files. Guard ranks 2 high-blast hunks as “read first”. Human does not need the whole diff.

### S-G — Bloat (Cut 2)

Agent reimplements a helper. Finding `duplicate_implementation`. Mute works. Queue through S-C.

### S-H — ADR on the node (Cut 3)

`prepare_change` for a file that an ADR names includes a `rationale_for` hit. Agent sees the ADR path.

### S-I — Off-limits (Cut 3)

Work order marks `packages/shared` off-limits. Advisory in Cut 3 default; hook blocks only if ADR accepted.

### S-J — Offline (all cuts)

Unplug the network. All of S-A–S-I except Cut 4 still work. No Cloud import in Core analysis paths.

---

## 10. Stitch design program

| Item | Value |
|---|---|
| Project | [Prism — agent-native Iris](https://stitch.withgoogle.com) `projects/10137496421656524676` |
| Design system | `assets/d245d959e20741b4b1a79458a19c19b6` from `plans/mockups/DESIGN.md` |
| Count | Historical 15 × 3 in Stitch. **Product:** Envelope (5 capabilities) + 10 siblings |
| Creative range | EXPLORE, aspect LAYOUT only (not color, not a new brand) |
| Shell | Console rail for fleet/loop/cost; Iris = Repository analysis + Envelope rows (no map); playground/website/IDE for Spectrum; IDE webview for Guard / hook |
| Forbidden | Chat bubbles, avatars, Iris-as-a-person, rainbow, glow, glass |

**Variant intent (same for every feature):**

1. **Inspector** — Spectrum or list on the left, 288px inspector is the job.
2. **Workbench** — dense table + primary action (Fix / Queue / Apply).
3. **Instrument** — one metric or one pack, meters, almost no chrome.

Screen list and prompts: [`../mockups/STITCH_AGENT_NATIVE.md`](../mockups/STITCH_AGENT_NATIVE.md).

Owner picks one variant per feature (or one global variant) before implementation. Implementation locks to `CONSOLE_FLEET.md` craft bar plus the chosen Stitch frame.

---

## 11. What we will not build in this program

- AgentsView-style parsers of 20+ agent JSONL formats
- Ponytail personality / ultra YAGNI
- Hosted Graphify-style MCP with API keys
- Multimodal LLM extraction of PDFs/images/video
- Serena-style LSP host or `replace_symbol_body` in Core
- Vector search as default retrieval
- Unattended scheduled **edits**
- Third-party OAuth inside Prism (ADR-0049)
- Cloud or paid implementation (Cut 4 discussion only)
- Prism-written markdown in the checkout (`AGENTS.md`, `CLAUDE.md`, `{repo}/.prism/*.md`, Graphify-style `GRAPH_REPORT.md`)

---

## 12. Sequence after owner approval

**Done** 2026-09-17. M-069–M-076 Verified on `main`. T1/T2/T3 proofs recorded. Cut 4 set aside.

1. [x] Owner picks Stitch variants (or “inspector everywhere”).
2. [x] Owner approves this program (or marks edits).
3. [x] First engineering milestone opened; `PROGRESS.md` updated per merge.
4. [x] `milestone/M-069-agent-substrate` from latest `main`.
5. [x] M-070 (pack + reuse + House Style), M-071 Finding Loop, M-072 Guard — Cut 1, one branch at a time.
6. [x] Later milestones merged to `main`, then the next. No stacking. Phase 2 = M-073–M-074. Phase 3 = M-075–M-076.

---

## 13. Open questions inside Cuts 1–3 — **resolved**

Defaults shipped. Cut 4 stays set aside.

| ID | Question | Resolution |
|---|---|---|
| P-Q1 | Token budget default for `prepare_change`? | 4000 map tokens |
| P-Q2 | Is `prepare_change` one tool or pack + reuse as two? | **One tool** (composition rule) |
| P-Q3 | Finding fingerprint algorithm | hash(source + path + normalized title) |
| P-Q4 | Guard session vs git dirty set | minus `preExistingChanges` (ADR-0045 already has this for jobs) |
| P-Q6 | Verify steps when `typecheck` is missing | **Detect allowlisted scripts/argv; empty → —** (locked 2026-09-11). See 3-PHASES §2. |

---

## 14. References

- [M-058](../archive/milestones/M-058_agent-surface.md) · [M-059](../archive/milestones/M-059_reference-precision.md)
- [ADR-0029](../adr/0029-signal-provenance.md) · [ADR-0045](../adr/0045-checkout-first-jobs.md) · [ADR-0049](../adr/0049-host-delegated-integrations.md) · [ADR-0052](../adr/0052-product-identity-and-iris.md) · [ADR-0053](../adr/0053-console-information-architecture.md)
- [CONSOLE_FLEET.md](../mockups/CONSOLE_FLEET.md)
- [COMPETITIVE_LANDSCAPE_2026-09.md](../notes/COMPETITIVE_LANDSCAPE_2026-09.md)
- [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) Q-009 unchanged. Q-010 phone-home unchanged; local Envelope ledger is owner-approved in §0.

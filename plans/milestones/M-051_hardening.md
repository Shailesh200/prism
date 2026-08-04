# M-051 — Hardening & Signal Integrity

| Field | Value |
|---|---|
| Status | **Draft** (not started — M-050 must merge first) |
| Branch | `milestone/M-051-hardening` (from latest `main`) |
| New ADR | [ADR-0029](../adr/0029-signal-provenance.md) (**Proposed**) — signal provenance |
| Amends | ADR-0013 (layer signals), ADR-0023 (trends history), ADR-0027 / Q-023 (risk bands), ADR-0024 (consent) |
| Source | Repo-wide audit 2026-08-05 — 67 findings, 22 high severity |
| Owner decisions | Fake map heat → fix so synthetic never looks measured · risk bands → unify · vehicle → new hardening milestone before feature work |

> **Sequencing note.** M-050 is `In Progress` and two commits ahead of `main`. Per `AGENTS.md`
> (one milestone In Progress, never stack branches) this milestone cannot open until M-050 is
> smoked, approved, merged, and marked Verified.

---

## 1. Goal

Make the intelligence Prism already ships **trustworthy and durable** before building more on top
of it. Three specific outcomes:

1. The index never silently diverges from disk.
2. No number reaches a user that Prism cannot account for.
3. A decision recorded in an ADR or `OPEN_QUESTIONS.md` is enforced by code, not by memory.

This is deliberately *not* a feature milestone. Nothing here adds a capability; everything here
makes an existing capability honest, correct, or verifiable.

---

## 2. Why now (evidence)

The audit found no sloppiness — zero TODO/FIXME/HACK in source, zero skipped tests, zero committed
build artifacts, consistent moon tasks across all 17 packages, `verify:milestone` green. What it
found instead is the debt profile of a project that shipped 38 milestones quickly: correctness gaps
in the newest code, honesty gaps where stubs were never revisited, and decisions that were recorded
as settled without being enforced.

Four findings were opened and confirmed directly rather than reported:

| Finding | Location | Confirmed |
|---|---|---|
| `flushWatch` clears dirty paths before reindexing and ignores the `Result` | [`workspace.ts:629-656`](../../packages/core/src/workspace.ts) | Yes |
| Map `performance` / `ownership` heat derived from a path hash | [`layer-signals.ts:99-125`](../../packages/repository-map/src/layer-signals.ts) | Yes |
| Publish workflow releases on any `packages/**` push to `main` | [`publish-extension.yml:7-13`](../../.github/workflows/publish-extension.yml) | Yes |
| Webview RPC has no timeout and never calls `reject` | [`host-client.ts:93-126`](../../packages/vscode-extension/src/webview/host-client.ts) | Yes |

The watch bug is the most serious: it is the failure mode where Prism confidently answers from a
stale index, which is worse than answering "I don't know".

**Correction to the audit's framing on risk bands.** The audit reported the tooling risk floors
(70 for critical, 45 for elevated) as contradicting the 60/20 bands. On inspection they are
*band-consistent*: 70 lands in High, 45 lands in Mid, exactly as ADR-0027 §7.2 intended. The real
defects are narrower and are what this milestone fixes: there is **no shared band function**, so
the mapping is re-derived in at least three places including twice in the UI; and
`engineering.ts:39-43` uses an **inverted 80/60/40 scale** where a higher number is better, so `60`
means "low concern" on one screen and "High risk" on another.

---

## 3. Principles for this milestone

1. **Absence beats invention.** A missing signal is rendered as missing. Never zero, never a hash.
2. **Fix the class, not the instance.** Provenance in the contract rather than six UI patches.
3. **Every fix ships with the test that would have caught it.** The watch bug survived because
   `startWatch` has no tests at all.
4. **No new capability.** If a change makes Prism able to do something new, it belongs elsewhere.
5. **Additive contracts only.** M-025 froze the SDK; new DTO fields are optional (ADR-0019).
6. **Corrections to the plan are part of the work.** Reconciling docs is in scope, not a chore.

---

## 4. Scope — phases

Each phase is independently verifiable and independently revertible. Phases run in order; any
phase may be cut without invalidating earlier ones.

### Phase 0 — Release safety

The publish workflow triggers on `paths: packages/**`, bumps the version, pushes directly to
`main` with `contents: write`, and releases to Marketplace and Open VSX. Merging a Core-only
milestone therefore ships a public release with no human decision — routing around the plan's own
rule that `main` advances only by owner-approved merges.

**Owner decision (2026-08-05): publish on a git tag.** Releases become an explicit, named act
that leaves a marker in history — which a path filter cannot do, and which `workflow_dispatch`
alone does not record in the repository.

| Task | Detail |
|---|---|
| 0.1 | Replace the `push: paths: packages/**` trigger with `push: tags: ["repo-prism-v*"]` |
| 0.2 | Remove the auto-bump job; the version bump becomes part of cutting the tag, so CI no longer pushes commits to `main` and `contents: write` can be dropped to read |
| 0.3 | Keep `workflow_dispatch` as a manual fallback for re-running a failed publish at an existing tag |
| 0.4 | Keep the per-platform native `better-sqlite3` matrix unchanged |
| 0.5 | Document the release ritual in `packages/vscode-extension/PUBLISH.md`: bump → commit → tag `repo-prism-vX.Y.Z` → push tag |
| 0.6 | Guard: fail the workflow if the tag version and `package.json` version disagree |

### Phase 1 — Correctness: watch, index, and webview RPC

The common thread: each of these is a path where a failure is currently invisible. The index goes
stale while reporting fresh, a corrupt store reads as empty, a dead host reads as a slow one.

| Task | Detail |
|---|---|
| 1.1 | `flushWatch`: do not clear `pendingChanged` / `pendingDeleted` until `runIndex` reports `ok`; on failure restore the paths, keep status `stale`, and schedule a retry |
| 1.2 | Check the `runIndex` `Result`; add `lastError?` to `IndexFreshness` so the surface can show degraded state |
| 1.3 | Tests: watch happy path, watch failure path (index fails → paths retained → status stale), debounce coalescing, `getIndexFreshness` shape |
| 1.4 | Tests for incremental indexing — `changedPaths` / `deletedPaths` currently have **no** coverage in `@prism/indexer` |
| 1.5 | `saveBookmark` / `removeBookmark` return `Result` instead of throwing; corrupt `bookmarks.json` surfaces an error rather than reading as empty |
| 1.6 | Tests for `parseBookmarkStore`, `sortBookmarks`, bookmark CRUD, including the corruption path |
| 1.7 | Cache: count rows skipped for corruption and surface the count; do not silently degrade the index |
| 1.8 | Inventory: count unreadable directories rather than swallowing the `readdir` failure |
| 1.9 | Tests for `navigateFeature` and `resolveEndpointNodeId` (exported since M-016 with zero coverage) |
| 1.10 | Webview RPC: give every request a deadline and reject on expiry — today `reject` is stored in the pending map and **never called**, so a host failure hangs the panel with no timeout and no recovery ([`host-client.ts:93-126`](../../packages/vscode-extension/src/webview/host-client.ts)) |
| 1.11 | Clear the pending map on panel dispose/reload so in-flight requests fail loudly instead of leaking; stop silently dropping responses whose id is unknown |
| 1.12 | Validate messages crossing the webview boundary against the `@prism/shared` schemas in both directions, instead of casting (`prism-panel.ts:75-76`, `host-client.ts:87-89`) |
| 1.13 | Surface RPC failure in the UI as an error state with a retry, not an indefinite spinner — long operations (Analyze, Lighthouse, reindex) are where this bites hardest |

### Phase 2 — Signal provenance (ADR-0029)

| Task | Detail |
|---|---|
| 2.1 | `@prism/shared`: add `SignalProvenance` and the invariant that `"unavailable"` implies no numeric value |
| 2.2 | `@prism/repository-map`: remove `stableUnit` fabrication. `performance` → `unavailable` (no source exists today); `ownership` → `measured` from git or `unavailable`; `coverage` → `measured` when a test mapping exists, `unavailable` otherwise |
| 2.3 | `@prism/intelligence`: health-history backfill points marked `"estimated"`; region movers inherit it |
| 2.4 | `@prism/core`: propagate provenance through map, health, history and overview DTOs |
| 2.5 | `@prism/ui`: map layer toggles disabled with a reason when every node is `unavailable`; legend gains an explicit no-data entry |
| 2.6 | `@prism/app-shell`: Overview ring renders `—` not `0/100` when health is absent; trends render estimated points visibly distinct from measured ones |
| 2.7 | `@prism/vscode-extension`: `gitStatus` distinguishes `loading` / `unavailable` / `error` instead of treating null as failure |
| 2.8 | Tests: a git-less fixture yields `unavailable`, never a number; a contract test asserts no DTO carries a value with `"unavailable"` |

### Phase 3 — Risk band unification (Q-023 enforcement)

| Task | Detail |
|---|---|
| 3.1 | `@prism/shared`: `RISK_BANDS` + `riskToBand(score)` — High ≥ 60, Mid ≥ 20, else Low |
| 3.2 | `@prism/impact`: consume the helper; expose `band` on `BlastRadiusReport` and `ChangeReviewReport` (additive) |
| 3.3 | `@prism/app-shell`: delete the duplicated thresholds in `BlastRadiusScreen.tsx:164-178` and `ChangeReviewScreen.tsx:29-33`; read `band` from the DTO |
| 3.4 | `@prism/intelligence`: rename the engineering-health `80/60/40` severity so it can never be read as risk — it measures *weakness*, not risk, and currently inverts the meaning of the same number |
| 3.5 | Document the tooling floors (70 critical / 45 elevated / 25–40 by file role) in an ADR-0027 amendment as **intentional band minimums**, since they are band-consistent and were misread as drift |
| 3.6 | Tests: band boundaries at 19/20/59/60; one golden per surface proving both screens agree |
| 3.7 | Consolidate the five divergent `isTestPath` implementations into one shared helper |

### Phase 4 — Plan reconciliation and gate hardening

| Task | Detail |
|---|---|
| 4.1 | Reconcile M-022, M-025, M-042, M-043 — all marked Verified with unchecked DoD boxes. Check with evidence or downgrade the status |
| 4.2 | Author `plans/milestones/M-027_mcp-tools-pack.md`, referenced from four documents but never written |
| 4.3 | Refresh `PRD.md`: surface table (§5) still calls MCP/CLI/VS Code/Cursor "Planned"; §6.2 still calls M-042 active; §8 typography predates ADR-0014 |
| 4.4 | `CORE_SDK.md`: document `stageDevopsRemote`, `runLocalWorkspaceTests`, `listLocalWorkspaceTests` |
| 4.5 | Route `stageDevopsRemote` through the Core consent gate — it currently reaches `api.github.com` without one, which is an ADR-0024 gap for direct SDK callers |
| 4.6 | `scripts/check-plan-progress.mjs`: fail when a milestone is Verified with unchecked DoD boxes, so this class of drift cannot recur |
| 4.7 | Master Plan §9.3 still shows a Turbo + Biome snippet superseded by ADR-0003; refresh and bump "Last updated" |
| 4.8 | `OPEN_QUESTIONS.md`: mark Q-023 as enforced in code, with the floor exceptions noted |
| 4.9 | Align Node pins: `.nvmrc` (`26`), root `engines` (`26.5.0`), moon (`26.5.0`), CI (`"26"`); remove the duplicate `.moon/toolchains.yml` if unused |

---

## 5. Out of scope — with destinations

Nothing below is dismissed; each has a home. Keeping them out is what makes this milestone
shippable.

| Deferred work | Destination | Why not here |
|---|---|---|
| Graph memoisation per snapshot; async git signals; sequential inventory hashing; full cache rewrite per index; triple AST walk; O(V²) layout BFS | **M-035 Perf Hardening** | All of it needs budgets and a fixture at scale to prove; that is M-035's entire purpose |
| Move analysis out of the UI: `cwv-parse.ts`, `overview-model.ts`, `DomainScreen` aggregation, `host-dispatch` test-output parsing | **M-052 Surface Consolidation** (new) | Large, and it is really a *prerequisite for MCP/CLI* — those surfaces need logic Core does not yet own |
| Deduplicate `map-client.ts` (1261 lines) against `host-client.ts` (940 lines); shared app shell; split `DomainScreen.tsx` (5463 lines); a11y pass | **M-052 Surface Consolidation** | Same blast radius, same reviewer, same milestone |
| Multi-signal detectors, negative fixtures, framework catalogue rot | **M-053 Detection Quality** (new) | Needs fixture repos per stack; a research task, not a fix |
| Real integration tests (17 configs currently `passWithNoTests`, 4 real files repo-wide) | **M-037 E2E Suite** | Already the named owner of this |
| Windows/macOS CI matrix; lint `plans/**` and fixtures; `suspicious` rules to error | **M-035 / M-039** | Will surface a backlog of its own; do not mix with correctness work |
| Compute health properly at each sampled commit instead of `"estimated"` | Follow-up to ADR-0029 | Phase 2 makes it honest; making it *accurate* is a separate cost |

---

## 6. Contract changes

All additive, per ADR-0019.

| Package | Change |
|---|---|
| `@prism/shared` | `SignalProvenance`; `RISK_BANDS` + `riskToBand`; shared `isTestPath`; `IndexFreshness.lastError?` |
| `@prism/repository-map` | `LayerSignalScores` values become nullable with per-signal provenance |
| `@prism/intelligence` | `HealthHistoryPoint.provenance`; engineering severity renamed |
| `@prism/impact` | `band` on blast and change-review reports |
| `@prism/core` | Propagation only; `saveBookmark`/`removeBookmark` return `Result`; `stageDevopsRemote` consent-gated |

**Breaking-ish:** `saveBookmark` / `removeBookmark` currently throw and will return `Result`.
Both are M-048 Phase 6 APIs with no external consumers; treat as a fix, note in `CORE_SDK.md`.

---

## 7. Definition of Done

- [x] M-050 Verified and merged; this branch cut from updated `main`
- [x] Only one milestone `In Progress`
- [x] ADR-0029 Accepted with implementation notes
- [x] Phase 0 — publish cannot fire without an explicit human action
- [x] Phase 1 — watch failure retains dirty paths; regression test proves it
- [x] Phase 1 — incremental indexing, bookmarks, and navigation entry points have tests
- [x] Phase 1 — no webview request can outlive its deadline; killing the host surfaces an error, not a spinner
- [x] Phase 2 — no DTO emits a numeric value with `"unavailable"` provenance (contract test)
- [x] Phase 2 — a git-less fixture repository renders no-data states, not colour
- [x] Phase 3 — exactly one `riskToBand`; no threshold literals remain in `@prism/app-shell`
- [x] Phase 3 — one `isTestPath`
- [x] Phase 4 — `check-plan-progress` fails on Verified-with-open-DoD
- [x] Phase 4 — PRD, CORE_SDK, Master Plan and OPEN_QUESTIONS reconciled
- [x] Phase 4 — `stageDevopsRemote` refuses before any request without `consentGranted`
- [x] `bun run verify:milestone` green **with `--force`** (cache bypassed — the last run served 18/20 tasks from cache)
- [ ] Manual smoke checklist below — **owner action**, cannot be run unattended
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 8. Verification plan

| Kind | Check |
|---|---|
| Unit | `riskToBand` boundaries at 19/20/59/60 |
| Unit | `flushWatch` retains dirty paths when `runIndex` fails |
| Unit | `layer-signals` returns `unavailable` for `performance` on every input |
| Unit | Bookmark store corruption returns an error, not an empty store |
| Contract | No DTO in the Core surface carries a number with `"unavailable"` |
| Contract | `api-surface.test.ts` updated for the changed bookmark signatures |
| Integration | Index a fixture, fail the reindex, assert freshness reports stale with an error |
| Integration | Git-less fixture → map layers unavailable end to end |
| Regression | Existing blast/safe-delete goldens on `m011-refs` unchanged |
| Manual | Open the extension on a repo with no git history — nothing shows fabricated heat |
| Manual | Blast Radius and Change Review agree on the band for the same path |
| Unit | An RPC request whose response never arrives rejects at the deadline |
| Manual | Kill the extension host mid-request — the panel shows an error with a retry, not an endless spinner |
| Manual | Reload the panel during a long Analyze — the in-flight request fails cleanly instead of leaking |

## 9. Risks

| Risk | Mitigation |
|---|---|
| The product looks emptier after Phase 2 | Correct, and intended — but confirm the owner accepts a visibly less colourful map on git-less repos before merging |
| Scope creep into M-052 territory while touching the same files | Phases are ordered so UI work is last and shallow; any refactor beyond rendering is out |
| Renaming the engineering severity scale ripples into the Trends UI | Additive rename with the old field retained for one milestone |
| Frozen SDK churn | All fields optional; `CORE_SDK.md` updated in the same phase |
| Reconciling DoD boxes may reveal a milestone that is genuinely incomplete | Good — that is the point. Downgrade rather than tick |

## 10. Sequencing

```text
M-050 smoke → approve → merge → Verified
  → cut milestone/M-051-hardening from main
    → Phase 0 (release safety)      → verify
    → Phase 1 (correctness + tests) → verify
    → Phase 2 (provenance, ADR-0029)→ verify
    → Phase 3 (bands)               → verify
    → Phase 4 (plan reconciliation) → verify:milestone --force
  → owner review (no commits until approved)
```

## 11. References

- Audit source: repo-wide review 2026-08-05 (67 findings; 22 high)
- ADR-0004 Core-only surfaces · ADR-0013 layer signals · ADR-0019 SDK versioning ·
  ADR-0023 trends history · ADR-0024 consent · ADR-0027 multi-lane signals · ADR-0029 provenance
- Code: `packages/core/src/workspace.ts`, `packages/repository-map/src/layer-signals.ts`,
  `packages/impact/src/internal.ts`, `packages/intelligence/src/health/engineering.ts`,
  `.github/workflows/publish-extension.yml`

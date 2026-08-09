# M-053 — Presentation Consolidation

| Field | Value |
|---|---|
| Status | **In Progress** |
| Branch | `milestone/M-053-presentation-consolidation` (from latest `main`) |
| Depends on | M-052 |
| Unlocks | — |
| Packages | `@repo-prism/core`, `@repo-prism/intelligence`, `@repo-prism/app-shell`, `@repo-prism/ui`, `@repo-prism/vscode-extension`, `apps/playground` |
| Amends | [ADR-0004](../adr/0004-core-only-integration-surface.md), [ADR-0021](../adr/0021-app-shell-consolidation.md) |

## 1. Goal

Finish what [M-052](./M-052_surface-consolidation.md) started. M-052 lifted the Overview
aggregation and the test runners into Core and stopped there, because everything remaining touches
what the user actually looks at and can only be verified by a human looking at it.

This milestone is the half that needs a human in the room.

## 2. Why it was split

M-052 §3a records the decision. In short: "lift analysis into Core" is provable by tests, and
"restructure the presentation layer" is provable by screenshots and a keyboard. Those are different
kinds of evidence and they deserve different milestones. Bundling them meant the riskiest change in
the milestone would have shipped with the weakest evidence behind it.

## 3. Scope

### Phase 1 — Inventory (carried from M-052 Phase 1)

| Task | Detail |
|---|---|
| 1.1 | Publish `plans/notes/M-053-inventory.md`: every analysis symbol still in `@repo-prism/app-shell`, `@repo-prism/vscode-extension` and `apps/playground` — symbol, file, what it computes, whether Core already has an equivalent |
| 1.2 | Classify each: **move to Core** / **move to `@repo-prism/intelligence`** / **legitimately presentational** |
| 1.3 | Characterisation tests against the current implementations before anything moves, capturing today's output verbatim — including output that looks wrong |
| 1.4 | Record where the playground and extension already disagree. Divergence is a finding, not something to quietly fix mid-move |

### Phase 2 — `getDomainReport(domain)`

The largest single task carried over. `DomainScreen.tsx` renders six domains and contains the
parsing, aggregation and thresholds for all of them.

| Task | Detail |
|---|---|
| 2.1 | Per-domain aggregation → Core as `getDomainReport(domain)`, returning a discriminated union over the six domains |
| 2.2 | One domain at a time, each its own commit with its own characterisation test, so the diff stays reviewable |
| 2.3 | `github-ci.ts` routed through Core with the M-051 consent gate applied — reachable only from `DomainScreen`, hence blocked behind 2.1 |
| 2.4 | CWV parse convergence: `cwv-parse.ts` → `@repo-prism/intelligence`, converging with `cwv-from-artifact.ts` onto one path |

### Phase 3 — Screen structure

| Task | Detail |
|---|---|
| 3.1 | Record `DomainScreen.tsx` line count before and after Phase 2. Do not chase a target — the aggregation leaving is the point, the line count is the symptom |
| 3.2 | Extract only primitives duplicated three or more times verbatim (section shell, empty state, metric tile) into `@repo-prism/ui`. De-duplication, not redesign |
| 3.3 | Leave `DnaScreen.tsx`, `BlastRadiusScreen.tsx` and `OverviewScreen.tsx` structurally alone |
| 3.4 | Zero visual change, enforced by before/after screenshots of all six domain screens |

### Phase 4 — Unify the two clients

`apps/playground/src/map-client.ts` and `packages/vscode-extension/src/webview/host-client.ts` are
two implementations of the same client against the same Core surface — one over HTTP, one over
`postMessage`.

| Task | Detail |
|---|---|
| 4.1 | One `PrismClient` interface in `@repo-prism/app-shell` covering every method both clients serve |
| 4.2 | Two thin transports behind it: `HttpTransport` and `PostMessageTransport`. Method bodies live once |
| 4.3 | Retain M-051's RPC deadline, rejection and schema validation. This phase must not regress it |
| 4.4 | Delete the duplicated bodies. Success is lines removed, not added |

### Phase 5 — Accessibility and consistency

| Task | Detail |
|---|---|
| 5.1 | Keyboard navigation for every interactive control |
| 5.2 | ARIA roles/labels on custom controls (treemap, map canvas, KPI tiles) |
| 5.3 | Focus management on panel and modal open/close |
| 5.4 | Colour contrast against the ADR-0014 dark tokens. Record failures; do not silently retune brand colours |

## 4. Out of scope

| Deferred work | Destination |
|---|---|
| Performance of the lifted paths | M-035 |
| New domain capabilities or screens | Future feature milestones |
| Design changes, retuning ADR-0014 tokens | Not planned |
| Detection-quality fixes surfaced while moving detector code | Logged, not fixed here |

## 5. Contract changes

Additive only, per [ADR-0019](../adr/0019-core-sdk-versioning.md).

| Package | Change |
|---|---|
| `@repo-prism/core` | `getDomainReport(domain)`; CWV convergence; `github-ci` behind consent |
| `@repo-prism/intelligence` | Absorbs CWV parsing |
| `@repo-prism/shared` | `DomainReport` discriminated union |
| `@repo-prism/app-shell` | `PrismClient` interface + two transports |

## 6. Definition of Done

- [x] M-052 Verified and merged; this branch cut from updated `main`
- [x] Only one milestone `In Progress`
- [x] Inventory published with every entry classified (`plans/notes/M-053-inventory.md`)
- [x] No analysis logic left in `@repo-prism/app-shell` outside the presentational list (allowlist guard + Core `getDomainReport` / CWV / github-ci)
- [x] `getDomainReport` reachable from Core, all six domains, with tests
- [x] One `PrismClient` interface; two transports; no duplicated method bodies (T-09)
- [x] M-051's RPC deadline/rejection/validation behaviour intact (regression test in `app-shell` + `host-client`)
- [x] Phase 1 characterisation tests pass unchanged — behaviour moved, not altered
- [x] `CORE_SDK.md` documents every new method
- [x] `bun run verify:milestone` green (2026-08-08)
- [ ] Manual smoke: all six domain screens + completion checklist (`plans/notes/SMOKE_COMPLETION_PROGRAM.md`)
- [ ] Manual: keyboard-only pass through Overview, Domains, Blast Radius
- [ ] Owner approval → commit → merge → Verified → snippet shared
- [x] Number audit published (`plans/notes/M-053-number-audit.md`); ADR-0033 (github-ci/PageSpeed via Core)
- [x] Successor stubs M-056–M-063 + Master Plan rows
- [x] Completion-program implementation landed on this branch (M-056…M-063 code); smoke + commit sequencing still owner-gated

## 7. Risks

| Risk | Mitigation |
|---|---|
| A pure refactor silently changes rendered output | Characterisation tests plus screenshots for what tests cannot capture |
| The move reveals the surfaces already disagree | Expected. Record it, choose deliberately, write it down |
| Lifting analysis out of a 5,463-line component produces an unreviewable diff | One domain per commit, each with its test |
| Client unification regresses M-051's RPC hardening | 4.3 is explicit; regression test is in the DoD |

## 8. References

- [M-052](./M-052_surface-consolidation.md) §3a — the re-scope decision and what already landed
- [ADR-0004](../adr/0004-core-only-integration-surface.md) Core-only integration surface
- [ADR-0021](../adr/0021-app-shell-consolidation.md) app-shell consolidation
- [ADR-0029](../adr/0029-signal-provenance.md) signal provenance

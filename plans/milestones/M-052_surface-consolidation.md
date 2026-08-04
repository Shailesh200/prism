# M-052 — Surface Consolidation

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-052-surface-consolidation` (from latest `main`) |
| Depends on | M-051 |
| Unlocks | M-026, M-027, M-028, M-029, M-037 |
| Packages | `@prism/core`, `@prism/intelligence`, `@prism/app-shell`, `@prism/vscode-extension`, `apps/playground` |
| Amends | [ADR-0004](../adr/0004-core-only-integration-surface.md), [ADR-0021](../adr/0021-app-shell-consolidation.md) |

## 1. Goal

Make ADR-0004 true again. The rule is that every surface consumes `@prism/core` and nothing
reimplements analysis — but analysis has been leaking into the presentation layer milestone by
milestone. Today a meaningful amount of Prism's intelligence exists only inside React components
and the extension host, which means **MCP and CLI cannot reach it**.

This milestone moves that logic down into Core and splits the files that grew large enough to
hide it.

## 2. Why now

Two independent reasons converge.

**Architectural.** MCP (M-026/M-027) and CLI (M-028/M-029) are next. Every analysis behaviour
still living in `app-shell` is a behaviour agents and scripts cannot have. Worse, if a surface
reimplements it, the IDE and the agent give *different answers for the same repository* — the
exact failure ADR-0004 exists to prevent, enshrined into a public tool contract.

**Practical.** The presentation layer has outgrown review. Current sizes:

| File | Lines |
|---|---|
| `packages/app-shell/src/DomainScreen.tsx` | 5,463 |
| `packages/app-shell/src/DnaScreen.tsx` | 1,732 |
| `packages/app-shell/src/BlastRadiusScreen.tsx` | 1,662 |
| `apps/playground/src/map-client.ts` | 1,261 |
| `packages/app-shell/src/OverviewScreen.tsx` | 1,279 |
| `packages/vscode-extension/src/host-dispatch.ts` | 997 |
| `packages/vscode-extension/src/webview/host-client.ts` | 940 |

`DomainScreen.tsx` alone is larger than most packages in this repository. It renders six domains
and contains parsing, aggregation and threshold logic for all of them.

## 3. Principles

1. **Move, don't rewrite.** Behaviour must be identical after the move. Any behaviour change is a
   separate, called-out decision — not a side effect of relocation.
2. **A test at the old level before the move, a test at the new level after.** This is how we prove
   identity rather than assert it.
3. **Additive contracts only.** M-025 froze the SDK ([ADR-0019](../adr/0019-core-sdk-versioning.md)).
   New Core methods are new surface; existing signatures do not change.
4. **Split by domain, not by size.** Cutting a 5,463-line file into five 1,000-line files achieves
   nothing. Each extracted module must have a nameable responsibility.
5. **No new capability.** Same rule as M-051. If a user can do something new, it belongs elsewhere.

## 4. Scope — phases

### Phase 1 — Inventory and characterisation tests

Nothing moves in this phase. The point is to make the move provable.

| Task | Detail |
|---|---|
| 1.1 | Enumerate every piece of analysis logic in `@prism/app-shell`, `@prism/vscode-extension` and `apps/playground`. Produce `plans/notes/M-052-inventory.md`: symbol, current file, what it computes, whether Core already has an equivalent |
| 1.2 | Classify each entry: **move to Core** / **move to `@prism/intelligence`** / **legitimately presentational, stays** |
| 1.3 | Write characterisation tests against the current implementations, capturing today's output for representative inputs — including the wrong-looking outputs, which get preserved verbatim and fixed separately if at all |
| 1.4 | Record any behaviour that differs between the playground and extension paths today. Divergence found here is a *finding*, not something to silently resolve during the move |

### Phase 2 — Lift analysis into Core

| Task | Detail |
|---|---|
| 2.1 | `cwv-parse.ts` → `@prism/intelligence`; expose via Core. The CWV artifact→report path already partly exists (`cwv-from-artifact.ts`); converge on one |
| 2.2 | `overview-model.ts` → Core as `getOverviewModel()`. This is the Overview screen's entire aggregation and is currently unreachable from any non-UI surface |
| 2.3 | `DomainScreen` per-domain aggregation → Core as `getDomainReport(domain)`, returning a discriminated union over the six domains |
| 2.4 | `host-dispatch.ts` test-output parsing → `@prism/intelligence`, joining the existing `testing/` module |
| 2.5 | `github-ci.ts` → route through Core with the consent gate applied in M-051 Phase 4.5 |
| 2.6 | `stack-signal-meta.ts`, `security-stack-label.ts` — decide per Phase 1 classification; label mapping may legitimately stay presentational |
| 2.7 | Every new Core method gets unit tests plus an entry in `plans/guides/CORE_SDK.md` |

### Phase 3 — Screen structure (conservative)

> **Owner decision 2026-08-05: do not split the screen files this milestone.** `DomainScreen.tsx`
> is the heart of the product's UX, and a large unattended refactor of it risks exactly what this
> milestone is supposed to protect. Phase 2 already removes the *analysis* from it, which is the
> architectural goal; reducing its line count is cosmetic by comparison and can wait for a
> milestone with a human watching.

| Task | Detail |
|---|---|
| 3.1 | After Phase 2, `DomainScreen.tsx` should shrink substantially on its own — the aggregation it loses is the bulk of its non-JSX weight. Record the before/after line count; do not chase a target |
| 3.2 | Extract only the domain primitives that are already duplicated three or more times verbatim (section shell, empty state, metric tile) into `@prism/ui`. Pure de-duplication, no redesign |
| 3.3 | Leave `DnaScreen.tsx`, `BlastRadiusScreen.tsx` and `OverviewScreen.tsx` structurally alone |
| 3.4 | Zero visual change, enforced by before/after screenshots of all six domain screens |
| 3.5 | Record the deferred split as a follow-up item so the decision is visible rather than forgotten |

### Phase 4 — Unify the two clients

`apps/playground/src/map-client.ts` (1,261 lines) and
`packages/vscode-extension/src/webview/host-client.ts` (940 lines) are two implementations of the
same client against the same Core surface — one over HTTP, one over `postMessage`.

| Task | Detail |
|---|---|
| 4.1 | Define one `PrismClient` interface in `@prism/app-shell` covering every method both clients serve |
| 4.2 | Two thin transports behind it: `HttpTransport` (playground) and `PostMessageTransport` (webview). All method bodies live once |
| 4.3 | Retain the M-051 Phase 1 RPC deadline, rejection and schema-validation work — this phase must not regress it |
| 4.4 | Delete the duplicated method bodies. Success is measured by lines removed, not added |

### Phase 5 — Accessibility and consistency pass

Deferred here from the audit; cheap once the screens are split and expensive before.

| Task | Detail |
|---|---|
| 5.1 | Keyboard navigation for every interactive control in the split screens |
| 5.2 | ARIA roles/labels on custom controls (treemap, map canvas, KPI tiles) |
| 5.3 | Focus management on panel and modal open/close |
| 5.4 | Colour-contrast check against the ADR-0014 dark tokens; record failures rather than silently retuning brand colours |

## 5. Out of scope

| Deferred work | Destination |
|---|---|
| Performance of the lifted code paths | M-035 |
| New domain capabilities, new screens | Future feature milestones |
| Design changes, retuning ADR-0014 tokens | Not planned |
| Detection-quality improvements surfaced while moving detector code | M-053 |
| Rewriting the map rendering layer | Not planned |

## 6. Contract changes

Additive only, per ADR-0019.

| Package | Change |
|---|---|
| `@prism/core` | `getOverviewModel()`, `getDomainReport(domain)`; CWV convergence; `github-ci` behind consent |
| `@prism/intelligence` | Absorbs CWV parsing and test-output parsing |
| `@prism/shared` | New DTOs: `OverviewModel`, `DomainReport` (discriminated union) |
| `@prism/app-shell` | New `PrismClient` interface + two transports; screens split into modules |

## 7. Definition of Done

- [ ] M-051 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] Inventory published at `plans/notes/M-052-inventory.md` with every entry classified
- [ ] No analysis logic remains in `@prism/app-shell` outside the "legitimately presentational" list
- [ ] `getOverviewModel` and `getDomainReport` reachable from Core with tests
- [ ] Screen line counts recorded before/after; no screen file restructured beyond de-duplication
- [ ] One `PrismClient` interface; two transports; no duplicated method bodies
- [ ] M-051's RPC deadline/rejection/validation behaviour intact (regression test)
- [ ] Characterisation tests from Phase 1 still pass unchanged — proving behaviour was moved, not altered
- [ ] `CORE_SDK.md` documents every new method
- [ ] `bun run verify:milestone --force` green
- [ ] Manual smoke: playground and extension render identically to pre-milestone screenshots
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 8. Verification plan

| Kind | Check |
|---|---|
| Characterisation | Phase 1 tests pass before and after each move with no expectation edits |
| Unit | `getOverviewModel` matches the old `overview-model.ts` output on fixtures |
| Unit | `getDomainReport` matches per-domain aggregation for all six domains |
| Contract | `api-surface.test.ts` updated; no existing signature changed |
| Integration | Playground and extension produce identical reports for the same fixture |
| Regression | Existing blast/safe-delete goldens on `m011-refs` unchanged |
| Manual | Before/after screenshots of all six domain screens — pixel-identical |
| Manual | Keyboard-only pass through Overview, Domains, Blast Radius |

## 9. Risks

| Risk | Mitigation |
|---|---|
| A pure refactor silently changes rendered output | Phase 1 characterisation tests exist precisely for this; screenshots for what tests cannot capture |
| The move reveals the two surfaces already disagree | Expected. Record as a finding, pick the correct behaviour deliberately, note it in the milestone |
| Lifting analysis out of a 5,463-line component produces a large diff | Phase 2 commits per extracted module, each with its characterisation test, so the diff is readable in pieces |
| Scope creep into fixing what we find | Only correctness-preserving moves here. Anything else gets logged for M-053 or a feature milestone |
| Client unification regresses M-051's RPC hardening | Phase 4.3 is explicit about it; regression test is in the DoD |

## 10. Sequencing

```text
Phase 1 (inventory + characterisation) → verify
Phase 2 (lift analysis into Core)      → verify
Phase 3 (split screens)                → verify
Phase 4 (unify clients)                → verify
Phase 5 (a11y pass)                    → verify:milestone --force
```

## 11. References

- [ADR-0004](../adr/0004-core-only-integration-surface.md) Core-only integration surface
- [ADR-0019](../adr/0019-core-sdk-versioning.md) SDK versioning · [ADR-0021](../adr/0021-app-shell-consolidation.md) app-shell consolidation
- [ADR-0024](../adr/0024-opt-in-network-integrations.md) consent · [M-051](./M-051_hardening.md) §5 deferred this work here

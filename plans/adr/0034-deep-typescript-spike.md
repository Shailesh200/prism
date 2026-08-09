# ADR-0034: Deep TypeScript analysis — spike result (reject for now)

| Field | Value |
|---|---|
| Status | **Rejected** (revisit later) |
| Date | 2026-08-09 |
| Decision makers | Owner, Architect |
| Related milestones | M-059, M-006, M-011 |
| Related | [ADR-0009](./0009-oxc-parser-v1-deep-ts-optional.md), [M-059 spike note](../notes/M-059-deep-ts-spike.md) |
| Amends | ADR-0009 §3 — deep TS remains optional and **off**; no adoption in this cycle |

## Context

M-059 required a timeboxed spike on optional `tsc` / `ts-morph` for on-demand
`findReferences`, benchmarked against the Oxc heuristic path. Reference
precision (homonyms, member calls, barrels, tsconfig, `require`, `.d.ts`) was
improved in the heuristic stack in the same milestone.

## Decision

**Do not adopt** a deep TypeScript program (default or opt-in) in this pass.

Reasons:

1. **Cost** — Program creation and project-references wiring are large relative
   to the remaining precision gaps after M-059 heuristic fixes.
2. **Latency / lifecycle** — MCP/CLI one-shots cannot amortize a warm language
   service; a cold program is too slow for the blast/refs interactive loop.
3. **Duplication** — Path/`extends`/`baseUrl` resolution already lives in
   intelligence aliases; a second system would drift.
4. **Spike honesty** — No full ts-morph integration was built. A minimal
   opt-in stub without a real program would only add dead API surface.

## Options considered

### Option A — Adopt ts-morph / tsc program (rejected)

- Pros: Type-accurate refs, overload resolution, richer member binding.
- Cons: Multi-second cold start; large dependency; conflicts with index-once
  Core model; exceeds M-059 scope.

### Option B — Minimal opt-in stub (`deepTs: true` no-op) (rejected)

- Pros: API placeholder for later.
- Cons: Lies about capability; versioning noise under ADR-0019.

### Option C — Reject for now; revisit later (chosen)

- Pros: Honest; ships M-059 precision wins; clear revisit triggers.
- Cons: Some hard semantic cases remain heuristic / low-confidence.

## Consequences

- Positive: ADR-0009 Oxc path stays the sole production analyzer; M-059 goldens
  document heuristic precision/recall.
- Negative: Dynamic imports, variable `require`, and type-checker-only bindings
  stay unresolved or low-confidence until a future milestone.
- Follow-up: Reopen when IDE long-lived sessions or measured recall gaps justify
  a dedicated milestone (not a silent scope expand).

## Revisit triggers

- Interactive IDE host can own a warm TS server process.
- Customer repos show systematic false negatives after M-061 detection work.
- Owner explicitly schedules a deep-TS milestone with perf budgets.

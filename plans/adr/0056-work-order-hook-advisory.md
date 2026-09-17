# ADR-0056: Work-order write veto is opt-in

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-09-17 |
| Decision makers | Owner, Architect |
| Related milestones | M-076 Work orders + hook |
| Builds on | [PROGRAM §6.2](../milestones/PROGRAM_agent-native-3-PHASES.md) O3 |

## Context

A work order can mark generated and vendor paths off-limits and ask for
sign-off on high-blast or shared-ownership files. An IDE hook that *vetoes*
a save is a new write-blocking surface. PROGRAM O3 requires an Accepted ADR
before that veto is live; until then the hook is advisory only.

## Decision

**The work-order hook is advisory until an Accepted ADR arms a write veto.**

1. `evaluateWorkOrderWrite` reports `allowed` / `blocked` / `needsSignOff`
   and a `copy` string. `veto` is true only when `hookArmed` is true and the
   path is `blocked` or `needsSignOff`.
2. `hookArmed` is true only when a committed ADR in the workspace is
   `Status: Accepted` and its text mentions a work-order write veto.
3. This ADR stays **Proposed**. Shipping it Accepted would arm the hook on
   this repository. Owner accepts it later if they want saves blocked.

## Options Considered

### Option A — Advisory default, Accepted ADR to veto (chosen)

- Pros: matches PROGRAM O3; this repo never vetoes by shipping the feature.
- Cons: a repo that wants vetoes must accept an ADR first.

### Option B — Veto by default

- Pros: stronger protection for vendor/generated files.
- Cons: surprises anyone saving generated output; PROGRAM forbids it.

## Consequences

- Positive: `needsSignOff` never blocks while this ADR is not Accepted.
- Negative: advisory warnings can be ignored.
- Follow-ups: accept this ADR (or a successor) to arm vetoes.

## Compliance

- [x] Linked from M-076
- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted

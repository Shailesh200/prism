# ADR-0068: Envelope is removed

| Field | Value |
|---|---|
| Status | **Accepted** (owner, 2026-10-17) |
| Date | 2026-10-17 |
| Decision makers | Owner |
| Related milestones | [M-094 Envelope v2](../archive/milestones/M-094_envelope-v2.md) (obsolete), [M-098](../milestones/M-098_real-agent-proof.md) |
| Supersedes | [ADR-0066](./0066-envelope-product-surface.md) |

## Context

ADR-0066 made Envelope a product surface: a per-session ledger of what Prism put into the agent's context, a footer in each receipt, `prism envelope`, and a calibrated "estimated saved". The calibration never worked. The B6 real-agent A/B measured no saving to calibrate against, so the line only ever said "not calibrated" (`plans/notes/prism-2-next-change-report.md`, VAL). The token and cost proof that matters is the published benchmark, and the hero is now Prepare and Lens Review.

## Decision

The owner decided on 17 Oct 2026 to remove Envelope entirely.

- Code is deleted: the `core` Envelope module, `prism envelope`, the receipt footer and the ledger writer.
- Docs, website, the 1.12.0 CHANGELOG entry and the privacy page no longer mention it.
- A user's existing `~/.prism/envelope-ledger.jsonl` is left on disk. Prism no longer reads or writes it.
- Token and cost proof lives in the benchmarks (`docs/benchmarks/2.x.md`, release gate GATE-T1..T4), not in a per-session ledger.

## Consequences

- ADR-0066 is superseded. M-094 is obsolete. The Envelope parts of M-087, M-091 and M-098 are dropped.
- The session value line (next plan P13) no longer depends on Envelope.
- If per-session cost reporting comes back, it needs a new ADR backed by a working calibration.

# ADR-0066: Envelope is a product surface

| | |
|---|---|
| Status | **Superseded** by [ADR-0068](./0068-envelope-removed.md) (2026-10-17). Accepted (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-094 Envelope v2](../archive/milestones/M-094_envelope-v2.md); calibration in [M-098](../milestones/M-098_real-agent-proof.md) |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §6 |

## Context

Envelope records every tool response's size and truncation in a local ledger, but nobody sees it during a session. Some tools return far more than their budgets (`prepare_change` averages ~7.7k tokens against 4k; `list_features` 73 KB). Prism's value to a developer (less wasted context) is invisible without it.

## Decision

1. **Sessions.** Tool calls, hook injections and the receipt carry a session id written at session start.
2. **Budgets.** One per-tool byte budget table. Over-budget responses are flagged.
3. **"Estimated saved"** appears only when calibrated against measured baselines from the real-agent benchmark (M-098). Until then it shows "not calibrated yet". Always labelled an estimate and linked to its method.
4. **Surfaces.** A one-line footer on every receipt, `prism envelope` (and `--json`), and the Iris screen.
5. **Privacy.** The ledger stores sizes, counts, tool names and paths from Prism's own answers. Never response bodies, prompts or file contents. Enforced by a schema test.

## Consequences

- Every session ends with a visible, honest cost line.
- The "saved" figure cannot be shown before M-098, by design.

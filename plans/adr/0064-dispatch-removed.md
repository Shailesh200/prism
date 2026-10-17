# ADR-0064: Dispatch is removed from the product, the MCP surface and the code

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestones | [M-091 Surface cut](../milestones/M-091_surface-cut.md) (surface + moves), [M-099 Delete Dispatch](../milestones/M-099_delete-dispatch.md) (code) |
| Completes | [ADR-0058](./0058-prism-does-not-run-agents.md) Jobs removal |
| Supersedes | Dispatch parts of [ADR-0035](./0035-dispatch-vertical.md), [ADR-0039](./0039-dispatch-chat-voice.md), [ADR-0057](./0057-prism-intelligence-unified-product.md) |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §4.4, §10 |

## Context

ADR-0058 stopped Prism running agents, but 14 Dispatch tools are still in the default MCP surface, about 47k lines remain in `dispatch` and `dispatch-hub`, and the hero features (the Envelope ledger, the last Prepare) live inside `@repo-prism/dispatch`.

## Decision

1. **Surface (M-091):** no Dispatch tool is registered on MCP. The second registration path is removed.
2. **Moves first (M-091):**
   - The Envelope ledger and prepare-last move into `@repo-prism/core`.
   - The `remember` store moves to Core-side Iris storage, and is exposed as `prism remember` plus Graph memory nodes.
   - Re-export shims live for one milestone.
3. **Delete last (M-099):**
   - `packages/dispatch` and `packages/dispatch-hub` are deleted, after the daemon is lifted out.
   - Jobs, Live Relay, the Skills editor, standup, and Dispatch extension and CLI code go with them.
   - Every removed export is checked with `safe_delete` first.
4. **Live Relay** is dropped, including its parked stash.

## Consequences

- The product is Prepare, Envelope, Graph, Receipt and Health.
- Verification lives on in the receipt. Fixing a finding is the user's own chat.
- The Jobs history under `~/.prism/hub` is removed by `prism data prune`.

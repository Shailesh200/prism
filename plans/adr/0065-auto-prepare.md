# ADR-0065: Prepare is injected on prompt submit

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-093 Prepare v2](../milestones/M-093_prepare-v2.md) |
| Consistent with | [ADR-0058](./0058-prism-does-not-run-agents.md) (hooks, no model) |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §5.2 |

## Context

`prepare_change` is the most-called Prism tool, but only when the model chooses to call it. Models under-call MCP tools. The one Prism behaviour that runs reliably is a hook (the receipt).

## Decision

1. A prompt-submit hook (Claude Code `UserPromptSubmit` first; Cursor `beforeSubmitPrompt` where available) injects a compact Prepare (about 800 tokens) as additional context **when the prompt is a change request**.
2. **Detection** is a deterministic local rule: a change verb plus at least one path or symbol the graph knows. No model is called.
3. **Never blocks.** It is skipped when the answer would take over 300 ms (daemon) or the in-process budget (before the daemon). Skips are logged.
4. Every injection is recorded in Envelope with `source: hook`, so its cost is visible.
5. Off switch: `PRISM_AUTOPREPARE=0`.

## Consequences

- The agent starts most changes with the pack, without any tool call.
- Prompt context grows by a bounded, measured amount. Envelope keeps that honest.

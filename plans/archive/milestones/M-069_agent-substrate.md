# M-069 — Agent substrate (Envelope + refs + edge provenance + verify-plan)

| Field | Value |
|---|---|
| Status | **Verified** (merged to `main` 2026-09-14) |
| Branch | `milestone/M-069-agent-substrate` (from latest `main`) |
| Depends on | M-068 Verified |
| Unlocks | M-070 `prepare_change` |
| Packages | `mcp-server`, `shared`, `intelligence`, `analyzer`, `impact`, `core`, `dispatch`, `dispatch-hub` |
| Program | [PROGRAM_agent-native-3-PHASES.md](../../milestones/PROGRAM_agent-native-3-PHASES.md) §4.1 |

## 1. Goal

Honest MCP pipe, True Refs goldens on `main`, Honest Edges, local Envelope
ledger, Console `#/iris` without Spectrum, and verify-plan that never invokes
a missing script.

## 2. In scope

S1 honest `search_symbols`, S2 M-059 goldens on this branch, S3–S4 edge
provenance, S5 ledger, S6 Iris, V-DETECT verify-plan.

## 3. Out of scope

`prepare_change`, Finding Loop, Guard, Living AGENTS.md, Cloud / paid.

## 4. Definition of Done

- [x] `bun run verify:milestone` green
- [x] `search_symbols` pattern `"e"` → `truncated: true` when matches exceed 50
- [x] Lint-only fixture verify is not Failure
- [x] `#/iris` has no map, Repos ▾, empty ledger copy is not `0%`
- [x] Owner review before commit

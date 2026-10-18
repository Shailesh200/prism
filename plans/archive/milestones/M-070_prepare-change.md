# M-070 — `prepare_change` (pack + reuse + House Style)

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-070-prepare-change` (from latest `main`, M-069 merged) |
| Depends on | M-069 Verified |
| Unlocks | M-071 Finding Loop |
| Packages | `shared`, `intelligence`, `core`, `mcp-server`, `cli`, `dispatch`, `dispatch-hub` |
| Program | [PROGRAM_agent-native-3-PHASES.md](../../milestones/PROGRAM_agent-native-3-PHASES.md) §4.2 |

## 1. Goal

One `prepare_change` call returns the right files for a task (pack), existing
helpers to reuse, and three House Style exemplars. Paths, symbols, and why —
never file bodies. `order` and `workingSet` stay `null` (`not in this build`).

## 2. In scope

P1 pack ranker, P2 reuse-by-intent, H1–H2 House Style, P3–P5 Core / MCP / CLI /
`start_job` inject, P6 Iris last-query facts, P7 no file bodies.

## 3. Out of scope

Finding Loop, Guard, Living AGENTS.md, work-order `order`, compaction
`workingSet`, Cloud / paid.

## 4. Definition of Done

- [x] Fixture “add caching to fetchUser” pack contains feature files + tests;
      `truncated` honest if over budget
- [x] Reuse hits an existing helper; empty list with `provenance: unavailable`
      when none — never a hallucinated symbol
- [x] Ambiguous homonym → candidates, no silent pick
- [x] Express route fixture → canonical handler; layout assertion, not an LLM
- [x] Mocked `start_job` worker prompt contains pack paths
- [x] MCP JSON has no fixture file-body token
- [x] `bun run verify:milestone` green
- [x] Owner review before commit

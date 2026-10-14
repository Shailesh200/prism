# M-091 — Surface cut

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-091-surface-cut` (from latest `main`) |
| Depends on | M-090 Verified |
| Unlocks | M-092 |
| Packages | `mcp-server` (`tools.ts`, `instructions.ts`, `dispatch-registry.ts`, `server.ts`), new `packages/envelope`, `dispatch` (re-export shims), `core` (memory store), `plugin` (skills, commands), `cli` (`prism remember`) |
| ADRs | [ADR-0064](../adr/0064-dispatch-removed.md) (surface part) |

## 1. Goal

An agent sees six Prism tools and about twelve lines of instructions, and nothing about jobs. The hero features no longer depend on the Dispatch package. Program §4.3, §4.4 step 1, §10.

## 2. In scope

| Item | Detail |
|---|---|
| Default tools | `prepare_change`, `blast_radius`, `guard_session`, `test_impact`, `repository_overview`, plus `find_symbol` and `explain_area` as stand-ins until `graph` (M-096) |
| Full pack | Everything else Intelligence behind `PRISM_MCP_FULL=1` (program §4.3 list) |
| Dispatch tools | Removed from MCP registration (all 14). The second registration path from ADR-0035 is removed |
| Instructions | Rewritten to ≤ 1.5 KB; contract test caps it |
| Envelope in Core | `envelope-ledger` and `prepare-last` move into `@repo-prism/core` with their tests. `dispatch` re-exports for one milestone. `mcp-server` no longer depends on `@repo-prism/dispatch` |
| Memory store | `remember` storage moves to Core-side Iris storage under `~/.prism` (same file format, migration if the path changes). New CLI `prism remember` / `prism forget` / `prism memories`. Prepare notes and Lenses read from the new home |
| Skills | Keep `prism-safe-change`, `prism-review-pr`, `prism-onboard`, `prism-ship`. Remove `prism-verify-regression` (the receipt covers it). Skill text names only default tools |
| Commands | `/prism-check`, `/prism-review`; `/prism-graph` lands in M-096 |
| Tests | The existing "skills only name visible tools" test stays and must pass |

## 3. Out of scope

- Deleting `packages/dispatch` or `dispatch-hub` (M-099).
- Dashboard / IDE screen removal (M-099).
- The `graph` tool (M-096).

## 4. DoD

- [ ] `tools/list` from the dev build returns exactly the default set; `PRISM_MCP_FULL=1` returns the full Intelligence pack and no Dispatch tools
- [ ] `instructions.ts` output ≤ 1.5 KB, enforced by test
- [ ] `packages/mcp-server/package.json` has no `@repo-prism/dispatch` dependency
- [ ] Memories written before the move are readable after it (migration test)
- [ ] Claude Code smoke session: the agent calls `prepare_change` then edits, with no Dispatch mention, transcript saved
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `bun run dev:link` then MCP `tools/list` in Cursor and Claude Code · smoke transcript in `plans/notes/smoke/M-091.md`.

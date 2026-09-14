# M-069 audit — M-058 / M-059 vs `main`

| Field | Value |
|---|---|
| Date | 2026-09-11 |
| Branch | `milestone/M-069-agent-substrate` |

## M-058 Agent Surface

P-C1 through P-C12 are **on `main`**: `changed_paths`, bounded graphs,
`search_symbols`, `workspace_status`, `capabilities`, compact JSON, index-error
rewrite, resources, deprecations.

**Leftover (this milestone S1):** `search_symbols` sliced to 50 then MCP
stamped `totalCount: items.length` and `truncated: false`. T0 recorded the lie.
Fixed in M-069: Core returns `{ items, totalCount }`; MCP sets
`truncated: items.length < totalCount`.

Recorded ≤5-call session: [M-069-session.md](./M-069-session.md).

## M-059 Reference precision

Goldens **already on `main`** under `packages/intelligence/fixtures/m059-*`
(homonym, member, cjs, tsconfig, dts) plus barrel chase. Precision note:
[M-059-precision.md](./M-059-precision.md). Deep-TS remains Rejected
(ADR-0034). No stacking on the old M-053 branch.

## Verify-plan

`verifyJobWork` always ran `typecheck` then `test`. Fixed in this milestone
(`resolveVerifyPlan`).

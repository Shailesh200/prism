# M-076 — Work orders + advisory hook

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-076-work-orders-hook` (from latest `main`, M-075 merged) |
| Depends on | M-070 (`prepare_change`), M-075 (notes; `order` still null) |
| Packages | `shared`, `intelligence`, `core`, `mcp-server`, `dispatch`, `cli`, `vscode-extension`, `dispatch-hub` |
| Program | [PROGRAM_agent-native-3-PHASES.md](../../milestones/PROGRAM_agent-native-3-PHASES.md) §6.2 |
| ADR | [ADR-0056](../../adr/0056-work-order-hook-advisory.md) (Proposed — hook stays advisory) |

## 1. Goal

A work order names what is in scope, what is off-limits, and what needs
sign-off. `prepare_change.order` is filled from blast fan-in, git ownership,
and generated/vendor paths. The IDE hook reports the three Stitch states and
never vetoes a write unless an **Accepted** ADR arms it.

## 2. In scope

### O1 — Fill `PrepareChange.order`

- `WorkOrder`: `inScope[]`, `offLimits[{ path, reason }]`, `needsSignOff[]`,
  `advisory`, `hookArmed`.
- **blocked / off-limits:** `classifyFileRole === "generated"` or a `vendor/`
  path segment (DNA / path role). Scanned on every indexed file, not only the
  pack.
- **needsSignOff:** pack files with reverse-import fan-in ≥ 2 (blast proxy)
  or ≥ 3 git contributors (shared ownership).
- **inScope:** pack files that are neither.
- `order` is always an object (never null). Empty lists are still a work order.

### O2 — MCP `work_order` + PRD copy

- Intelligence tool `work_order` `{ task, path? }` — same compute as
  `prepare_change.order`; optional `path` adds a hook evaluation.
- Dispatch copies off-limits into the job PRD the worker sees
  (`appendWorkOrderToPrd` in `composeWorkerPrompt`).

### O3 — ADR-gated veto

- Default **advisory**: `needsSignOff` / `blocked` never veto when no Accepted
  ADR arms the hook ([ADR-0056](../../adr/0056-work-order-hook-advisory.md) is
  Proposed).
- Arm only when a committed ADR is `Status: Accepted` (or the table form) and
  mentions a work-order write veto.

### O4 — Three-state copy

- Shared labels: allowed / blocked / needs sign-off. Blocked while unarmed is
  documented as **“not armed”**.
- Prompt, CLI `prism prepare`, Console prepare-history, and the IDE save
  warning use the same copy.

## 3. Out of scope

- Sandboxing, OS permissions, remote workers, Cut 4.
- Persisted extra off-limits prefixes (agent overlay on the MCP call is
  enough for one shot; high fan-in covers `packages/shared`-style cores).
- Pixel-perfect Stitch HTML for screen 15 (copy only).

## 4. Definition of Done

- [x] `prepare_change.order` is non-null; vendor + generated paths appear in
      `offLimits` (`packages/intelligence/src/prepare/pack.test.ts`,
      `packages/core/src/prepare-change.test.ts` on `m076-work-order`)
- [x] MCP `work_order` is registered and read-only
      (`packages/mcp-server/src/server.contract.test.ts`)
- [x] Worker prompt / PRD includes off-limits
      (`packages/dispatch/src/worker-orientation.test.ts`)
- [x] `evaluateWorkOrderWrite` never vetoes unless the hook ADR is Accepted
      (`packages/shared/src/work-order.test.ts`)
- [x] UI copy for allowed / blocked (not armed) / needsSignOff
- [x] `bun run verify:milestone` green

## 5. Owner smoke

1. `prepare_change` on the `m076-work-order` fixture — `order` present,
   `vendor/legacy.ts` in off-limits.
2. Save a vendor/generated file in the IDE — warning says **blocked (not
   armed)**; the save is not cancelled.
3. `start_job` on a task that packs that fixture — worker PRD lists
   Off-limits.

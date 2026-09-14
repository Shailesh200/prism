# Agent-native proof — T0 (before any of the 3 phases)

| Field | Value |
|---|---|
| Captured | 2026-09-11 |
| Workspace | `/Users/shaileshjha/Prism` (this product repo, indexed) |
| Status | **Before** Phase 1. No Envelope MCP. No verify-plan. |
| Do not treat as | A Dispatch job. No teammate was started. These are live MCP + shell probes. |

Replay after each phase with the same probes. Store T1/T2/T3 next to this file.

---

## T0-A — Pipe honesty (`search_symbols`)

**Probe:** MCP `search_symbols` `{ pattern: "e", limit: 50 }` on this repo.

| Field | T0 value | What it should be after Phase 1 |
|---|---|---|
| `items.length` | 50 | ≤ 50 |
| `limit` | 50 | 50 |
| `totalCount` | **50** (equals items) | **> 50** (true match count before slice) |
| `truncated` | **`false`** | **`true`** |

**Why this is a lie:** Core `searchSymbols` slices to 50 then MCP stamps `totalCount: result.value.length` and `truncated: false` (`packages/mcp-server/src/tools/graphs.ts` ~308–316; `packages/intelligence/src/semantic/build.ts` `SEARCH_SYMBOLS_MAX` then `.slice`). The agent concludes there are only 50 symbols whose names contain `"e"`.

**Bytes:** a 50-hit payload is already large; an unbounded dump of the same query would be worse. After Phase 1, Iris “bytes kept vs dump” is `JSON.stringify(items).length / estimatedUntruncatedBytes`.

---

## T0-B — Verify-plan (the Fail-on-missing-script bug)

**Today’s allowlist** (`packages/dispatch/src/job-verify.ts`):

```ts
VERIFY_STEPS = [
  { name: "typecheck", script: "typecheck" },
  { name: "test", script: "test" },
]
```

No read of `package.json` scripts. No lint. No Go/Python. Missing script is invoked anyway.

**Shell probe** (temp dirs, 2026-09-11):

| Repo | Command | Exit | Output |
|---|---|---|---|
| `{ scripts: { lint: "echo lint-ok" } }` | `bun run typecheck` | **1** | `error: Script not found "typecheck"` |
| same | `bun run lint` | 0 | `lint-ok` |
| `{ }` (no scripts) | `bun run typecheck` | **1** | `error: Script not found "typecheck"` |
| lint-only | `bun run test` | **1** | Bun falls through to **`/bin/test`** (`a package.json script "test" was not found`) |

`verifyJobWork` treats non-zero as **`failed`**. Console `verifyTag` maps failed → **Failure**. Skipped (no `package.json`) is **NA**, not an em dash.

**This Prism repo** has `typecheck`, `lint`, and `test` in root `package.json`, so the bug is invisible here. Fixtures must prove it.

**After Phase 1:** detect scripts first; never invoke absent names; lint-only → run lint; nothing found → `verification: "skipped"`, UI **—** (not Failure, not fake 0).

---

## T0-C — Envelope query

| Probe | T0 |
|---|---|
| Core `prepareChange` | **does not exist** |
| MCP `prepare_change` | **does not exist** |
| MCP `guard_session` / `queue_finding` / `working_set` / `agents_md` / `work_order` | **do not exist** |

`explore_code` similar exists (`findSimilar` in `packages/intelligence/src/explorer/report.ts`: same name +0.55, kind +0.15, shared feature +0.25). Reuse First will extend this, not invent an LLM.

---

## T0-D — Console Iris

`packages/dispatch-hub/src/dashboard/intelligence-view.tsx` still imports and mounts **`RepositoryMapView`**. No Envelope scoreboard. No Repos-filtered pipe metrics.

---

## T0-E — Finding Loop / Guard / Living AGENTS.md

| Piece | T0 |
|---|---|
| `JobRecord.origin: "finding"` | exists |
| Stable `FindingRef` fingerprint + re-scan resolve | **not built** |
| Guard session ledger | **not built** (`preExistingChanges` exists for jobs) |
| Living AGENTS.md under `~/.prism` | **not built** |
| Working set on `JobRecord` | **not built** |

---

## How to replay

Same workspace, after the phase merges:

1. MCP `search_symbols` `{ pattern: "e", limit: 50 }` — expect `truncated: true` and `totalCount > 50`.
2. `verifyJobWork` (or `scripts/agent-native-proof.ts`) on fixtures `verify-lint-only` / `verify-none` / `verify-go-test`.
3. MCP `prepare_change` `{ task: "add caching to fetchUser" }` on the Envelope fixture (Phase 1+).
4. Screenshot `#/iris` — no map; Repos ▾; dash not `0` when ledger empty.
5. Append a T1/T2/T3 section (do not edit T0 numbers).

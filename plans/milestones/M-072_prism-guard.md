# M-072 — Prism Guard

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-072-prism-guard` (from latest `main`, M-071 merged) |
| Depends on | M-070 Verified (blast, similar/reuse, pack) |
| Unlocks | Phase 1 T1 proof gate |
| Packages | `shared`, `intelligence`, `core`, `host-session`, `app-shell`, `mcp-server`, `vscode-extension`, `cursor-extension` |
| Program | [PROGRAM_agent-native-3-PHASES.md](./PROGRAM_agent-native-3-PHASES.md) §4.4 |
| ADR | [ADR-0055](../adr/0055-guard-session-boundary.md) — session boundary (G1) |

## 1. Goal

Rank the current session — dirty files minus whatever was already dirty
before a job started — by blast risk, flagged for a likely duplicate, an
orphaned new file, or a package boundary crossing. Available as an MCP tool
(`guard_session`) and as a live panel in the VS Code / Cursor extensions.

## 2. In scope

- **G1** Session boundary: `gitDirtyPaths − preExistingChanges` (ADR-0055).
- **Duplicate**: a new/changed exported symbol that looks like an existing
  one elsewhere (reuses M-070's `scoreReuse`).
- **Orphan**: a session file with zero inbound references in the dependency
  graph (never a test file).
- **Boundary**: a session file whose local package differs from the
  package most of the rest of the session touches.
- **Blast rank**: `computeBlastRadius` per session file — highest risk
  first, "read this one first."
- Core `guardSession()`, host-session `guardSession` RPC (same contract
  the webview and Console share), MCP `guard_session`, and a `Guard` panel
  in `vscode-extension` (shared build → `cursor-extension` per ADR-0020).

## 3. Out of scope

- Guard is read-only advisory — no hook, no blocking write (that is M-076's
  work-order veto, and only advisory even then).
- Wiring Guard directly into a running Dispatch job's own review (the
  extension stays Dispatch-free per AGENTS.md; only a caller with Dispatch
  access — MCP, or a future Dispatch integration — can pass
  `preExistingChanges` today).
- Console (`dispatch-hub`) surface — the spec calls for the IDE panel only.
- Debounce / latency tuning beyond what `guardSession`'s own cost already
  is; no artificial 300ms debounce added since the panel calls Guard on
  demand (open + refresh), not on every keystroke.

## 4. Definition of Done

- [x] Fixture: 20-file session, 2 heavily-imported hub files rank first by
      blast risk, `preExistingChanges` excluded from the ranking
      (`packages/core/src/guard-session.test.ts`)
- [x] Fixture: a file crossing into a different package than the rest of
      the session is flagged `boundary`; files in the dominant package are
      not (`packages/core/src/guard-session.test.ts`)
- [x] Unit: `orphan` flags a file nothing imports (never a test file);
      `duplicate` flags a new export that looks like an existing symbol
      elsewhere (`packages/intelligence/src/guard/session.test.ts`)
- [x] `guardSession` reaches no network (`packages/core/src/no-network.integration.test.ts`)
- [x] host-session RPC round-trip: the webview's `guardSession` request
      returns the same data `Core.guardSession()` would
      (`packages/vscode-extension/src/host-dispatch.integration.test.ts`)
- [x] `GuardScreen` renders the ranked list with flags, an empty state, and
      an unsupported-surface error (`packages/app-shell/src/GuardScreen.test.tsx`)
- [x] MCP `guard_session` documented, contract-tested, and instructed
      (`packages/mcp-server/src/server.contract.test.ts`,
      `packages/mcp-server/src/instructions.test.ts`)
- [x] `prism.guardSession` command registered in both `vscode-extension` and
      `cursor-extension` manifests
- [x] `bun run verify:milestone` green
- [x] Owner review before commit
- [x] Owner smoke: open Guard on a real dirty tree in VS Code / Cursor

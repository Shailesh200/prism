# M-075 — Symbol memory + ADR nodes

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-075-symbol-memory-adr` (from latest `main`, M-074 merged) |
| Depends on | M-070 (`prepare_change`), M-073 (`remember` store) |
| Packages | `shared`, `dispatch`, `intelligence`, `core`, `mcp-server`, `cli`, `host-session` |
| Program | [PROGRAM_agent-native-3-PHASES.md](../../milestones/PROGRAM_agent-native-3-PHASES.md) §6.1 |

## 1. Goal

Notes stick to a symbol or path, and committed rationale (ADRs, `WHY:` / `NOTE:` comments) shows up as `rationale_for` edges. `prepare_change` includes both for pack files so an agent sees the ADR path (S-H).

## 2. In scope

### Memory anchors (M1)

- `remember` accepts optional `symbol` and/or `path`.
- Stored ids rewrite when a rename is applied (`applyRename`) and via
  `migrateWorkspaceMemories` (same rewrite `renameImpact` describes).
- `renameImpact` itself stays a report — it never writes (MCP read-only).

### Pack notes (M2)

- `PrepareChange.notes`: memories and `rationale_for` hits for pack files.
- `formatPrepareChangePrompt` includes them. Still no file bodies.

### ADR / comment edges (A1/A2)

- Indexer/KG: committed text only (`.md` / source), never PDF/image/video.
- `plans/adr/**` (and `ADR-NNNN` filenames) become `adr` nodes.
- Path mentions and `WHY:` / `NOTE:` comments become `rationale_for` edges
  (`measured` when the text was read).

## 3. Out of scope

- `PrepareChange.order` / work-order hook (M-076).
- Inspector / map UI for notes on a node.
- Muting or editing ADR text.

## 4. Definition of Done

- [x] `remember` persists `symbol` / `path`; omit them when absent
      (`packages/dispatch/src/memory.test.ts`)
- [x] Rename rewrite moves a symbol-anchored memory; a file rename moves
      path-anchored ones (`packages/shared/src/memory-anchors.test.ts`,
      `packages/shared/src/prism-home.test.ts`)
- [x] Fixture ADR that names a pack file appears as `rationale_for` on the KG
      and in `prepare_change.notes` (`packages/intelligence/src/prepare/pack.test.ts`,
      `packages/intelligence/src/semantic/rationale.test.ts`)
- [x] `prepare_change` includes a matching memory note for a pack path
      (`packages/intelligence/src/prepare/pack.test.ts`)
- [x] MCP `remember` accepts `symbol` / `path`
      (`packages/mcp-server/src/dispatch-registry.ts`)
- [x] `bun run verify:milestone` green

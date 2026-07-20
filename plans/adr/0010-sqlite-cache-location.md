# ADR-0010: Local SQLite cache location and privacy

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner (via Q-002 default + M-008) |
| Related milestones | M-008, M-033, M-036 |
| Resolves | Q-002 |
| Related | [ADR-0003](./0003-locked-performance-stack.md) (`better-sqlite3`) |

## Context

M-008 persists index metadata and file analysis under a local SQLite database. Prism is local-first: caches must never leave the machine unless the user explicitly opts into a future remote feature (out of GA).

## Decision

1. **Location:** workspace-local  
   `<workspaceRoot>/.prism/cache/index.sqlite`  
   (directory created on demand; `.prism/` remains gitignored).
2. **Engine:** `better-sqlite3` (ADR-0003).
3. **Privacy:** cache is local-only; Core/indexer never upload DB contents; no Prism Cloud.
4. **Corruption:** if open/integrity fails, delete the DB file and rebuild on the next index (no silent use of corrupt data).
5. **XDG / user-global cache:** deferred — not used for GA; revisit only if multi-checkout sharing is required.

## Consequences

- Positive: Simple mental model; cache travels with the repo checkout; easy to wipe (`rm -rf .prism`).
- Negative: Multiple clones do not share cache; large monorepos grow a local DB per clone.

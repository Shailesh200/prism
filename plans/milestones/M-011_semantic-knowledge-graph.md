# M-011 — Semantic Knowledge Graph

| Field | Value |
|---|---|
| Branch | `milestone/M-011-semantic-kg` |
| Status | Verified |
| Depends on | M-009 |
| Unlocks | M-012, M-020, M-023 |
| Packages | `@repo-prism/graph-engine`, `@repo-prism/analyzer`, `@repo-prism/core` |

## Goal

Elevate file-level facts into a **symbol-centric** semantic knowledge graph: symbols, references, containment, and “related to” edges that power explorer and impact.

## In Scope

- Node kinds: `Symbol`, `File`, `Module`, `Type` (as needed)
- Edge kinds: `defines`, `references`, `contains`, `implements`, `extends`, `tests` (heuristic)
- Reference resolution within TS project best-effort
- Core API: `getKnowledgeGraph()`, `findSymbol()`, `findReferences()`

## Out of Scope

- Perfect cross-language references
- Embedding-based similarity (later optional)

## Definition of Done

- [x] Fixture: find references returns expected locations
- [x] Graph stats exposed (node/edge counts)
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual symbol query

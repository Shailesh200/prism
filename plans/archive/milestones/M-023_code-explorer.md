# M-023 — Code Explorer Queries

| Field | Value |
|---|---|
| Branch | `milestone/M-023-code-explorer` |
| Status | Verified |
| Depends on | M-011 (semantic KG), M-042 (git signals), M-012 (features) |
| Unlocks | M-027 MCP explorer tools, VS Code / playground explorer UI |
| Packages | `@repo-prism/intelligence`, `@repo-prism/shared`, `@repo-prism/core` |
| ADR | ADR-0018 |

## Goal

Stable **selection-scoped** Code Explorer query API in `@repo-prism/core`: usages,
ownership, related features / tests / APIs / components, structural similar
implementations (v1), and file git timeline — all local, with evidence notes and
fail-soft git.

## Context — what already exists (compose, don’t redo)

- `findSymbol` / `findReferences` (M-011) — promote into explorer DTO
- `listFeatures` / feature graph (M-012)
- KG `tests` edges + path heuristics for related tests
- `getBackendReport` endpoints for related APIs by handler file
- Core git cache (`readGitSignals`) for ownership + timeline (ADR-0013)
- No embeddings — similar impl is structural only

## In Scope

- **`CodeExplorerReport` DTO** in `@repo-prism/shared` (Zod-stable)
- **`buildCodeExplorerReport()`** in `@repo-prism/intelligence` (pure)
- **Core `exploreCode(target)`** — requires `index()`; injects git + optional
  backend endpoints
- Target: `{ kind: "file", path }` or `{ kind: "symbol", name, path?, start? }`
- Sections: usages, ownership, related (features/tests/apis/components),
  similar, timeline
- ADR-0018 Accepted; unit + Core fixture tests

## Out of Scope

- Playground / IDE explorer UI (follow-up)
- MCP tool registration (M-027)
- Symbol/line blame, remote git
- Embedding / ML similarity
- Changing `findSymbol` / `findReferences` signatures (remain available)

## Definition of Done

- [x] Schema + builder + fixture notes / unit tests for each section
- [x] Core `exploreCode()` wired; git soft-degrades
- [x] ADR-0018 Accepted; PROGRESS updated
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone`

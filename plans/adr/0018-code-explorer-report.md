# ADR-0018: Code Explorer report (selection-scoped Core query)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-22 |
| Decision makers | Owner |
| Related milestones | M-023 |
| Related | ADR-0004 (Core-only), ADR-0011 (features), ADR-0013 (git) |

## Context

Surfaces need one “understand this file/symbol” query covering usages, owners,
related tests/features/APIs, similar symbols, and git timeline. Pieces already
exist as separate Core APIs (`findReferences`, `getGitActivity`, features,
backend report). Without a composed DTO, every surface reinvents joins.

## Decision

### Option B — Selection-scoped `CodeExplorerReport` + `exploreCode` (chosen)

- One Zod DTO (`CodeExplorerReport`) with stable section shapes.
- Core `exploreCode(target)` composes existing engines + git cache.
- Existing `findSymbol` / `findReferences` remain for focused callers.
- Git sections fail soft (`gitAvailable: false`) when history is missing.
- Similar implementations v1 = structural (same export name, shared feature,
  import neighborhood) — no embeddings.

### Target kinds

| kind | Required fields |
|---|---|
| `file` | `path` |
| `symbol` | `name` (+ optional `path`, `start` for disambiguation) |

## Options Considered

### Option A — Only document existing APIs as “explorer”

- Pros: zero code
- Cons: unstable contracts; surfaces diverge

### Option B — Composed report (chosen)

- Pros: one Core call; Zod-stable; matches M-022/M-044 pattern
- Cons: larger payload (acceptable; sections can be empty)

## Consequences

- Positive: MCP/IDE can ship explorer without reimplementing joins
- Negative: report depends on index quality + optional git/backend
- Follow-ups: UI (playground/VS Code); MCP tools in M-027

## Compliance

- [x] Milestone M-023 documents DoD against this ADR

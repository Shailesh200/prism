# M-002 — Shared Contracts & Error Model

| Field | Value |
|---|---|
| Branch | `milestone/M-002-shared-contracts` |
| Status | Verified |
| Depends on | M-001 |
| Unlocks | M-003 |
| Packages | `@prism/shared` |

## Goal

Define the canonical TypeScript types, Zod schemas, result/error model, and ID conventions used by every Prism package.

## In Scope

- `Result<T, E>` / typed error taxonomy (`PrismError`)
- Core domain IDs: `RepoId`, `FileId`, `SymbolId`, `NodeId`, `EdgeId`, `FeatureId`
- Path normalization helpers (POSIX-style relative paths in contracts)
- JSON-serializable DTO conventions for MCP/CLI
- Zod schemas for public-facing payloads (even if Core not fully built)
- Unit tests for schema round-trips

## Out of Scope

- Parsing code, graphs, persistence schema (DB tables come in M-008; may draft types only)

## Definition of Done

- [x] `@prism/shared` builds and is importable
- [x] Error codes documented in package README
- [x] ≥90% coverage on schema helpers (100% on contract modules)
- [x] `bun run verify:milestone` green
- [x] PROGRESS updated; owner approved (2026-07-20)

## Verification

Typecheck · Lint · Unit · Build · Manual review of public types · Docs

## Owner Approval Checklist

- [x] Error model is clear and stable enough for Core
- [x] No leaking Node-specific types into DTOs

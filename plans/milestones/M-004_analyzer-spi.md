# M-004 — Analyzer SPI & Plugin Host

| Field | Value |
|---|---|
| Branch | `milestone/M-004-analyzer-spi` |
| Status | Verified |
| Depends on | M-003 |
| Unlocks | M-005 |
| Packages | `@prism/analyzer`, `@prism/core` (wiring) |

## Goal

Define the language plugin SPI so TypeScript (and later Tree-sitter languages) plug into a uniform host without Core knowing parser details.

## In Scope

- `LanguagePlugin` interface: `id`, `extensions`, `detect`, `parse`, `extractSymbols`, `extractImports`
- Plugin registry + capability negotiation
- Dummy `noop` plugin for tests
- ADR: plugin isolation & versioning

## Out of Scope

- Real ts-morph implementation (M-006)
- Multi-language grammars (M-034)

## Definition of Done

- [x] SPI documented with sequence diagram
- [x] Registry unit tests (register/resolve/conflict)
- [x] Core can list loaded plugins
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Build · Manual SPI doc review

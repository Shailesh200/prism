# ADR-0020: Cursor packaging overlay (single extension product)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Related | [Q-004](../OPEN_QUESTIONS.md), M-030, M-031, M-032 |

## Context

Prism needs a Cursor IDE surface. Options:

1. **Fork** a separate Cursor extension with its own host code
2. **Single product** — ship `@repo-prism/vscode-extension` as the implementation, with
   `@repo-prism/cursor-extension` as a thin packaging/brand overlay
3. **One VSIX only** — no Cursor-specific package

Cursor is VS Code API-compatible. Duplicating host/webview code would diverge
from Core-only surface rules and double maintenance.

## Decision

**Option 2:** One implementation (`@repo-prism/vscode-extension`); `@repo-prism/cursor-extension`
is a packaging overlay that:

- Stages the same `dist` / `media` build artifacts
- Uses Cursor-oriented `displayName` / description / categories
- Keeps activation and Core session identical (`@repo-prism/core` only)

MCP (when shipped) and the extension both call Core; they coexist as separate
surfaces, not competing analysis engines.

## Consequences

- Positive: one code path for Map/dashboard; F5 works in Cursor today
- Positive: Q-004 closed without Marketplace dependency
- Negative: two package.json manifests to keep `contributes` in sync (build/docs)
- Follow-up: Marketplace publish can reuse the VS Code package or overlay VSIX

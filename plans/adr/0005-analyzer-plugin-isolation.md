# ADR-0005: Analyzer plugin isolation & SPI versioning

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner, Architect |
| Related milestones | M-004, M-006, M-034 |
| Supersedes | — |

## Context

Prism must support TypeScript/JS first (Oxc), then additional languages (Tree-sitter), without Core or surfaces embedding parser details. Plugins evolve independently; a bad or incompatible plugin must not silently corrupt the index.

## Decision

1. **SPI lives in `@prism/analyzer`** as `LanguagePlugin` + `PluginRegistry` + `AnalyzerHost`.
2. **Core wires the host** via `AnalyzerPort`; surfaces never import `@prism/analyzer`.
3. **Plugins declare `spiVersion`**; the host accepts only versions in a published min/max range (currently `1`–`1`).
4. **Extension ownership is exclusive** — registering a second plugin for the same extension fails with validation conflict.
5. **`ParseResult.ast` is opaque** — only the producing plugin’s extractors may interpret it.
6. **Capability flags** advertise what the plugin implements; future hosts may skip unsupported ops.

## Options Considered

### Option A — Versioned SPI + exclusive extensions (chosen)

- Pros: Clear negotiation; safe multi-language growth; testable with `noop`.
- Cons: Two plugins cannot share `.js` without a composite plugin later.

### Option B — Soft extension sharing (priority list)

- Pros: Flexible for overlapping JS/TS tooling.
- Cons: Ambiguous resolution; harder to reason about in MCP/debug output.

## Consequences

- Positive: M-006 / M-034 plug in without Core API changes; conflicts are explicit.
- Negative: Overlapping languages need an explicit composite or higher-priority design later.
- Follow-ups: Document SPI bumps in CHANGELOG; bump `ANALYZER_SPI_VERSION_*` with an ADR when breaking.

## Compliance

- [x] Updates package README — `packages/analyzer/README.md`
- [x] Linked from milestone DoD — M-004

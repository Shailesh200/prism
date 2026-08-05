# ADR-0009: Oxc parser for v1; deep TypeScript optional later

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner (via ADR-0003 + M-006) |
| Related milestones | M-006, M-011+, M-034 |
| Related | [ADR-0003](./0003-locked-performance-stack.md), Q-015 |

## Context

M-006 ships the first real `LanguagePlugin` for TS/JS. ADR-0003 already chose **Oxc** for parse speed and toolchain cohesion. Full type-checker–accurate references may still be needed later for hard semantic cases.

## Decision

1. **Default path:** `@repo-prism/analyzer` TypeScript plugin uses **`oxc-parser`** (`parseSync`) for `.ts`/`.tsx`/`.js`/`.jsx` (and module variants).
2. **v1 extractions surface:** symbols, static imports/exports, call-site reference **hints**, file-level diagnostics — not type-accurate refs.
3. **Deep TS** (`ts-morph` / `tsc` program) remains **optional** and off by default (Q-015). Introduce only if measured gaps on M-011+ demand it; document via a follow-up ADR amendment.
4. **SWC:** only if Oxc API blocks a required extraction (document why in that PR).

## Consequences

- Positive: Fast indexing path; SPI stays parser-agnostic; noop + future Tree-sitter plugins coexist.
- Negative: Some reference quality gaps until optional deep TS or richer Oxc walks.

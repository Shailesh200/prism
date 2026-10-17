# M-006 — AST Engine (TypeScript / JavaScript via Oxc)

| Field | Value |
|---|---|
| Branch | `milestone/M-006-ast-engine-ts` |
| Status | Verified |
| Depends on | M-040 (plan); M-005 historically |
| Unlocks | M-007, M-034 |
| Packages | `@repo-prism/analyzer` |

## Goal

Ship the first real language plugin using the **Oxc parser** for TS/JS/TSX/JSX: fast parse, extract symbols, imports/exports, and reference hints needed by later graphs.

## In Scope

- `typescript` / `javascript` language plugin backed by Oxc
- Symbol extraction: functions, classes, interfaces, types, variables (exported emphasis)
- Import/export edges at file level
- Graceful parse errors (file-level diagnostics, no crash)
- Golden fixtures under `packages/analyzer/fixtures`
- ADR note: deep TS (`ts-morph` / `tsc`) is optional later if semantics require it
- SWC only if Oxc API blocks a required extraction (document why)

## Out of Scope

- Full type-checker–accurate references (may approximate)
- Non-JS languages (Tree-sitter in M-034)
- ts-morph as default

## Definition of Done

- [x] Plugin registered and selected by extension
- [x] Golden tests for symbols + imports
- [x] Throughput note vs fixture baseline documented
- [x] Diagnostics via shared result types
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Oxlint/Oxfmt · Unit · Integration (multi-file fixture) · Build · Manual JSON inspect

## Risks

- Semantic reference quality below ts-morph — accept for v1; track gaps for optional deep-TS ADR

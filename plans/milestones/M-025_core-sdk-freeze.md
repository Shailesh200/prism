# M-025 — Core Public SDK Stabilization (v0)

| Field | Value |
|---|---|
| Branch | `milestone/M-025-core-sdk-freeze` |
| Status | Verified |
| Depends on | M-014, M-015, M-016, M-020 (+ later Verified APIs included in inventory) |
| Unlocks | M-026, M-028, M-030, M-036 |
| Packages | `@repo-prism/core`, `@repo-prism/shared`, docs |
| ADR | ADR-0019 |

## Goal

Freeze a **v0.1.0 public SDK** surface for MCP / CLI / VS Code / Cursor to build
against: documented methods, stability tags, semver policy, capability flags,
and contract tests that lock accidental renames/removals.

## In Scope

- Audit all `Prism` / `PrismWorkspace` methods; mark `stable` vs `experimental`
- API reference markdown (`plans/guides/CORE_SDK.md`)
- Contract / export-lock tests in `@repo-prism/core`
- ADR-0019: versioning & deprecation policy
- Changelog for v0.1.0; bump `PRISM_CORE_VERSION` / package to `0.1.0`
- Fix capability flags (`map`, `navigation`) to match shipped engines
- Re-export primary return DTOs from `@repo-prism/core` so surfaces need not dual-import

## Out of Scope

- Implementing M-024 Insights or new product APIs
- Breaking refactors without ADR
- Publishing to npm registry

## Definition of Done

- [x] API reference published (`plans/guides/CORE_SDK.md`)
- [x] Contract test suite green
- [x] Stability table complete
- [x] ADR-0019 Accepted; CHANGELOG + version `0.1.0`
- [x] Verify + PROGRESS + owner approval

## Verification

`bun run verify:milestone`

## Owner Approval Checklist

- [x] Comfortable supporting this API through MCP/CLI/IDE work
- [x] Experimental markers acceptable

> Closeout boxes ticked 2026-08-05 during M-051 Phase 4. The milestone was
> approved and merged on 2026-07-23 (see `plans/PROGRESS.md`); only the ritual
> checkboxes were left unticked.

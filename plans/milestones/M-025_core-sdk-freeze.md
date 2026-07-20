# M-025 — Core Public SDK Stabilization (v0)

| Field | Value |
|---|---|
| Branch | `milestone/M-025-core-sdk-freeze` |
| Status | Not Started |
| Depends on | M-014, M-015, M-016, M-020 |
| Unlocks | M-026, M-028, M-030, M-036 |
| Packages | `@prism/core`, `@prism/shared`, docs |

## Goal

Freeze a **v0 public SDK** surface for surfaces to build against: documented methods, stability tags, semver policy, and compatibility tests.

## In Scope

- Audit all `workspace.*` methods; mark `stable` vs `experimental`
- Generate API reference (typedoc or markdown)
- Contract tests that surfaces will rely on
- ADR: versioning & deprecation policy
- Changelog section for v0.1.0

## Out of Scope

- Implementing missing experimental features
- Breaking refactors without ADR

## Definition of Done

- [ ] API reference published in repo docs folder
- [ ] Contract test suite green
- [ ] Stability table complete
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (contracts) · Build · Docs link check

## Owner Approval Checklist

- [ ] Comfortable supporting this API through MCP/CLI/IDE work
- [ ] Experimental markers acceptable

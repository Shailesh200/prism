# ADR-0019: Core SDK versioning & deprecation (v0 freeze)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Decision makers | Owner |
| Related milestones | M-025 |
| Related | ADR-0004 (Core-only surface) |

## Context

Surfaces (MCP, CLI, VS Code, Cursor) will bind tightly to `@prism/core`. After
M-025, accidental signature removals or silent capability lies are expensive.
Master Plan: public API breaks after M-025 require ADR + major version policy.

## Decision

### Package version (`@prism/core` / `PRISM_CORE_VERSION`)

| Range | Meaning |
|---|---|
| `0.0.x` | Pre-freeze scaffolding |
| **`0.1.0`** | **v0 freeze** (this ADR / M-025) — surfaces may build against documented `stable` APIs |
| `0.x.y` (x≥1) | Additive / experimental churn allowed under rules below |
| `1.0.0` | Future GA freeze (M-039 era); stricter SemVer |

Pre-1.0: **minor** bumps may still include breaking changes to
`experimental` APIs. **`stable` APIs** require an ADR + `PRISM_API_LEVEL` bump
before incompatible signature changes.

### `PRISM_API_LEVEL`

Integer advertised on `PrismClient.apiLevel` / `WorkspaceStatus.apiLevel`.

- Bump when any **`stable`** method signature or return DTO shape changes incompatibly.
- Do **not** bump for additive methods, optional fields, or experimental-only changes.
- Surfaces may gate on `apiLevel >= N`.

M-025 ships with `PRISM_API_LEVEL = 1` and `PRISM_CORE_VERSION = "0.1.0"`.

### Stability tags

| Tag | Meaning |
|---|---|
| `stable` | Supported for MCP/CLI/IDE through v0; breaking change needs ADR + apiLevel bump |
| `experimental` | May change without apiLevel bump; document in CHANGELOG |
| `internal` | Not for surfaces (`createWorkspace`, engine ports) — prefer `Prism.create` |

### Deprecation

1. Mark experimental or note in CORE_SDK + CHANGELOG.
2. Keep symbol at least one Core minor release when removing a previously `stable` API.
3. Prefer additive replacements over renames.

### Types policy

- **Calls** always through `@prism/core`.
- **Return / argument DTOs** are defined in `@prism/shared` and **re-exported** from `@prism/core` for convenience.
- Surfaces must not import `@prism/analyzer`, `@prism/indexer`, `@prism/intelligence`, etc.

## Consequences

- Positive: MCP/CLI/IDE have a clear contract; capability flags reflect reality
- Negative: experimental APIs (utilities, overlays, backend, explorer, eng health) may still shift before 1.0
- Follow-ups: M-026/028/030 consume this surface; GA hardens to 1.0 at M-039

## Compliance

- [x] Milestone M-025 documents DoD against this ADR
- [x] `plans/guides/CORE_SDK.md` stability table

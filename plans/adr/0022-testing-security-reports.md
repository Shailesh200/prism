# ADR-0022: Testing and Security reports (Core + product surface)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Decision makers | Owner |
| Related milestones | M-046, M-015, M-024 (superseded) |
| Related | ADR-0004 (Core-only), ADR-0012 (health weighting) |

## Context

Overview exposes a coarse **Test Presence** health factor. There is no first-class
Testing or Security product surface, and no typed Core reports for structure,
coverage, or left-shift tooling. M-024 Engineering Insights overlapped with
ranked-signal / Most Connected work and is absorbed into M-046 rather than
shipped as a separate insights engine.

Surfaces must not invent scores; analysis belongs in `@repo-prism/intelligence` and
is exposed via `@repo-prism/core` DTOs in `@repo-prism/shared`.

## Decision

Add typed Core APIs:

- **`getTestingReport()`** — detect unit / e2e / integration via structure
  (dirs, runners, patterns); parse on-disk coverage (`lcov.info`,
  `coverage-final.json`) when present; otherwise report presence honestly.
  Extension may offer a **Run tests** action that executes the project test
  command and ingests fresh coverage.
- **`getSecurityReport()`** — v1: left-shift tool detection (Dependabot,
  CodeQL, Snyk, Semgrep, Trivy, gitleaks, etc.) plus a small built-in
  per-domain checklist of fundamental checks.

Product surface:

- New **Testing & Security** tab in `@repo-prism/app-shell`, placed **below Domains**
  in the left nav.
- Overview replaces the single Test Presence card with a **dual-stat** card
  (Test score + Security score).
- Health **Test Presence** factor is recomputed from `getTestingReport`.

M-024 is **superseded** by this epic’s Most Connected / insights accuracy work.

## Options Considered

### Option A — UI-only heuristics over existing overlays

- Pros: fast.
- Cons: violates Core-only analysis; scores diverge across surfaces.

### Option B — Dedicated Core reports + tab (recommended)

- Pros: typed DTOs for MCP later; health factor stays honest; one analysis path.
- Cons: new schemas, parsers, and UI tab.

### Option C — Full SAST / coverage platform in Core

- Pros: deeper security story.
- Cons: out of scope for v1; network and runtime complexity; deferred.

## Consequences

- Positive: actionable Testing & Security surface; Overview dual-stat clarity
- Positive: closes M-024 without a separate insights milestone
- Negative: coverage numbers depend on artifacts or Run tests; security v1 is
  checklist-depth, not a full scanner
- Follow-up: MCP tools can later return the same DTOs (M-026+)

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-046)

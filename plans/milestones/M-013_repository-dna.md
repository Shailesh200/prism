# M-013 — Repository DNA & Detection

| Field | Value |
|---|---|
| Branch | `milestone/M-013-repository-dna` |
| Status | Not Started |
| Depends on | M-012 |
| Unlocks | M-014 |
| Packages | `@prism/intelligence`, `@prism/core` |

## Goal

Produce a compact **Repository DNA** profile: languages, frameworks, architecture style signals, package managers, test runners, and structural fingerprints.

## In Scope

- Detectors: Node/TS, React/Next, monorepo tools, test frameworks, linters
- Architecture hints: layered, modular monolith, package-based, etc. (heuristic)
- `RepositoryDna` DTO + Core API `getDna()`
- Extensible detector SPI

## Out of Scope

- Security vulnerability DB lookups (network)
- Non-local package registry calls

## Definition of Done

- [ ] DNA for fixture matches expected detector results
- [ ] Unknown stack still returns partial DNA (no throw)
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual DNA JSON review

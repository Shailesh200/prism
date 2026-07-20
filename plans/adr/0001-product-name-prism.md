# ADR-0001: Product name is Prism

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | Planning baseline |
| Supersedes | — |

## Context

The original planning brief used the working name **RepoPulse**. The owner selected **Prism** as the project/product name when creating the repository.

## Decision

The product, repository, and package scope use **Prism** (`@prism/*`). “RepoPulse” is retained only as a historical working-name reference in planning docs.

## Options Considered

### Option A — Keep RepoPulse

- Pros: Matches original brief wording
- Cons: Owner chose otherwise

### Option B — Prism (chosen)

- Pros: Owner preference; short brandable name
- Cons: npm scope `@prism` availability unknown (see Open Question Q-003)

## Consequences

- All packages named `@prism/<name>`
- CLI binary name: `prism`
- Docs and extensions branded Prism
- If npm scope is unavailable, ADR will supersede with a scoped rename before publish

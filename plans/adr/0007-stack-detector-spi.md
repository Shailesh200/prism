# ADR-0007: Pluggable stack + developer-persona detection

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner, Architect |
| Related milestones | M-040, M-013, M-014, M-034 |
| Supersedes | — |

## Context

Prism must tailor intelligence for many kinds of software **and** many kinds of developers: frontend, backend, mobile, desktop, data science, ML/AI, data engineering, DevOps/SRE, embedded, games, QA, and mixed monorepos. Hard-coding framework checks inside indexer/UI would force repeated refactors.

## Decision

1. **Plugin SPI** (`StackDetector`) in `@repo-prism/intelligence`, consumed only via `@repo-prism/core`.
2. Detectors emit additive **`StackSignal`s** with:
   - **`StackDomain`** — technology surface (`frontend`, `backend`, `mobile`, `desktop`, `data_ml_ai`, `data_engineering`, `devops_platform`, `embedded_systems`, `game`, `tooling`, `unknown`)
   - optional **`DeveloperPersona`** hints — audience shapes (`frontend_engineer`, `backend_engineer`, `fullstack_engineer`, `mobile_engineer`, `desktop_engineer`, `data_scientist`, `ml_engineer`, `ai_engineer`, `data_engineer`, `devops_sre`, `platform_engineer`, `embedded_engineer`, `game_developer`, `security_engineer`, `qa_engineer`, …)
3. **Local evidence only** (manifests, lockfiles, configs, inventory paths). No network.
4. **SPI early (M-040)**; **rich packs in M-013**.
5. Personas are **heuristic repo signals**, not identity or HR roles. UI/MCP must treat them as confidence-weighted suggestions.
6. Multi-match is normal: several domains + several personas per workspace.

## Options Considered

### Option A — Early SPI with domains + personas (chosen)

- Pros: Stable contracts; grows with plugins; enables persona-aware Map/MCP later.
- Cons: Stub profile until M-013.

### Option B — Framework list only, no personas

- Pros: Smaller model.
- Cons: Loses “who is this repo for?” which drives UX defaults for DS/ML/DevOps/Mobile vs FE.

## Consequences

- Positive: Later customization (notebook nav, infra risk, RN entrypoints, LLM eval folders) keys off profile capabilities.
- Negative: Taxonomy will evolve — keep IDs stringly-extensible; document renames via ADR.
- Follow-ups: Embed `StackProfile` in `DnaReport` (M-013); Map layers may filter by domain/persona.

## Compliance

- [x] Master Plan dependency graph + index
- [x] M-040 + M-013 docs
- [x] Feature mapping updated

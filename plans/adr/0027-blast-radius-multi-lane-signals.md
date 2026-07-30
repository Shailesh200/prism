# ADR-0027: Blast Radius Multi-Lane Signals (Hard + Soft)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-28 |
| Decision makers | Owner, Architect |
| Related milestones | **M-049** (implementation), M-048 Phase 8 (design host, deferred), M-020, M-021, M-046 |
| Supersedes | — (extends M-020/M-021; does not replace hard reverse-dep) |
| Related | [M-049](../milestones/M-049_blast-radius-depth.md), [M-048 Phase 8 note](../milestones/M-048_extension-polish.md), Q-022 / Q-023 |

## Context

Blast Radius today is **reverse reachability over the file dependency graph** (relative import / re-export edges), plus a small basename heuristic (`isRepoCriticalPath`) that boosts risk / blocks safe-delete for some configs.

That fails for roots that matter operationally but have **few or no importers** — notably test-runner configs (`vitest.config.ts`), lint configs, env files, and CI path filters. Users see **Low Impact (15)** and **Safe to Delete** with **0 dependents**, which undermines Blast Radius as a hero feature.

We need a deliberate policy: how soft signals coexist with hard graph edges, how they affect scoring and safe-delete, and how DTOs/UI expose confidence and evidence — without bypassing `@prism/core` or inventing analysis in extensions.

## Decision

**Option B — Soft edges + multi-lane DTOs/UI.**

1. **Two classes of impact edges:**
   - **Hard** — import / re-export (and future alias-resolved imports): authoritative for structural dependents.
   - **Soft** — config consumers, scripts, CI/Docker/task-graph, env heuristics: best-effort, always carry **confidence** + **evidence**.

2. **Reports merge lanes** in Core DTOs (`BlastRadiusReport` additive fields). UI presents **multi-lane** sections so “0 import dependents” is never the whole story when soft/tooling signals exist.

3. **Tooling-critical origins** (expanded catalog including Vitest/Jest/ESLint/env/CI) get elevated risk floors and are **never** “safe to delete” solely because the import graph is empty.

4. **Surfaces consume only Core**; soft-index construction lives in `@prism/intelligence` + `@prism/impact`.

5. Ship in **phases** (Vitest/Jest first) per M-049 Phase 8.1→8.3; alias resolution and CI deepen in later phases on the same branch.

6. **Q-022 default:** medium+ soft blockers block Safe Delete; low-confidence soft alone warns.
7. **Q-023 default:** unify Change Review risk bands to Blast **60/20**.

## Options Considered

### Option A — Expand basename criticality only (no soft edges)

- Pros: Tiny change; fixes “Low/Safe” for listed configs via score/safe-delete.
- Cons: Still **0 affected files**; no detailed blast; doesn’t list which tests/scripts break; weak hero story.

### Option B — Soft edges + multi-lane DTOs/UI (this ADR)

- Pros: Detailed impact; evidence; scales to CI/env/aliases; aligns Safe Delete / Test Impact / Change Review.
- Cons: Parser/dialect cost; false-positive risk; additive SDK fields.

### Option C — Full TypeScript program / IDE-grade resolution for all impact

- Pros: Highest fidelity aliases and project references.
- Cons: Heavy; conflicts with Oxc-first / optional deep-TS (ADR-0009); too large for one milestone.

**Chosen:** Option B, phased; Option A is an unacceptable long-term substitute.

## Consequences

- Positive: Config/tooling roots get honest risk and actionable affected sets; Blast UI can explain *why*.
- Negative: Soft false positives; need caps/truncation; more contract surface on frozen SDK (additive only).
- Follow-ups: MCP/CLI tool field docs (M-027/M-029); optional deeper type-only attrs.

## Compliance

- [x] Updates Master Plan / PROGRESS (M-049 In Progress for implementation)
- [x] Updates package README(s) / CORE_SDK notes when API impacted
- [x] Linked from milestone doc (M-049 + M-048 Phase 8 note)

## Notes

See M-049 §§2–11 for lanes, APIs, UX, and scoring. Tracking: M-049 branch.

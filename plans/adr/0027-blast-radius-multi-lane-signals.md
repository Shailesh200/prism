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

## Amendment 2026-08-05 (M-051) — risk floors are band minimums, not rival thresholds

An audit initially read the tooling floors as contradicting the Q-023 bands.
They do not, and this amendment records why so the same misreading does not
recur.

The bands answer *"what colour is this number?"*; the floors answer *"how low
may this number honestly go for this kind of file?"*. A floor never
reclassifies a band — it moves the score up to a minimum, and the single
`riskToBand` helper then bands it like any other score.

| Floor | Value | Lands in band | Reasoning |
|---|---|---|---|
| Tooling criticality `critical` | 70 | High (≥60) | A file the test runner or CI depends on is High even with zero importers — that is the failure M-049 existed to fix |
| Tooling criticality `elevated` | 45 | Mid (≥20) | Real but weaker coupling; High would over-warn |
| File role `config` | 40 | Mid | Mild fallback; tooling criticality usually floors configs higher first |
| File role `entry` | 35 | Mid | Deleting an entry point breaks a build the graph cannot see |
| File role `route` / `schema` | 30 | Mid | Externally reachable surface |
| File role `barrel` | 25 | Mid | Re-export hubs under-count in reverse reachability |
| File role `source` and all others | 0 | — | No floor; the graph speaks for itself |

Every floor sits comfortably inside a band rather than straddling a boundary,
so a floor can never produce a score whose band disagrees with its intent.
Role floors apply **only** when tooling criticality is `none`, so the two
systems never stack.

The genuine defects the audit found were elsewhere and are fixed in M-051:
duplicated band thresholds in `@prism/app-shell` (now one `riskToBand` in
`@prism/shared`), and an engineering-health severity scale that ran the
opposite direction on the same 0–100 axis (now renamed
`severityFromHealthScore`).

Source of truth: `CONFIG_FILE_RISK_FLOOR` in `packages/impact/src/internal.ts`
and `fileRoleRiskFloor` in `packages/shared/src/file-role.ts`.

## Compliance

- [x] Updates Master Plan / PROGRESS (M-049 In Progress for implementation)
- [x] Updates package README(s) / CORE_SDK notes when API impacted
- [x] Linked from milestone doc (M-049 + M-048 Phase 8 note)

## Notes

See M-049 §§2–11 for lanes, APIs, UX, and scoring. Tracking: M-049 branch.

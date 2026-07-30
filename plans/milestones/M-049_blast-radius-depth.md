# M-049 — Blast Radius Depth

| Field | Value |
|---|---|
| Status | **In Progress** |
| Branch | `milestone/M-049-blast-radius-depth` |
| Related ADR | [ADR-0027](../adr/0027-blast-radius-multi-lane-signals.md) (**Accepted** — Option B) |
| Prior note | Design was absorbed into M-048 Phase 8; **implementation** revived here after M-048 Verified |

> **Owner decision (2026-07-28 revive):** Implement the Phase 8 / M-049 design archive as product code on this branch (not on `main`). M-048 stays Verified for Phases 0–7; blast depth ships under M-049.

The sections below are the **design archive** (mechanics, lanes, APIs, UX, scoring, verification) — source of truth for implementation.

---

## 1. Goal

Make **Blast Radius** a trustworthy hero feature: for *every* meaningful change root (source, config, tooling, manifests, env, CI), Prism reports **detailed multi-lane impact** with **evidence** and **confidence** — not only reverse import dependents.

**User problem (observed):** selecting `packages/ai/vitest.config.ts` shows **Low Impact (15)**, **0 affected files / 0 dependents**, and **Safe to Delete**. That is mechanically correct under today’s import-only graph + narrow critical-path list, but product-incorrect: editing Vitest config can break or reshape an entire package’s test surface.

---

## 2. Why config files score low today (mechanics)

### 2.1 Pipeline (current)

```text
Index (AST imports/re-exports)
  → buildDependencyGraph (relative resolve only)
    → computeAffected (reverse BFS on hard edges)
    → risk score + optional isRepoCriticalPath boost
    → BlastRadiusReport / SafeDeleteReport / TestImpactReport
```

| Layer | Behavior relevant to configs |
|---|---|
| Analyzer | `.ts` configs (e.g. `vitest.config.ts`) are analyzed for **imports they make**, not for globs/setup they **declare**. JSON configs (`tsconfig`, `jest.config.json`) are often `skipped_unsupported`. |
| Resolve | Relative `./` / `../` only — **no** `tsconfig.paths` / package `#imports` aliases ([`resolve.ts`](../../packages/intelligence/src/dependency/resolve.ts)). |
| Impact | Affected set = reverse import/re-export reachability ([`computeAffected`](../../packages/impact/src/internal.ts)). |
| Critical path | [`isRepoCriticalPath`](../../packages/impact/src/internal.ts) boosts risk / blocks safe-delete for a **small basename list**: `package.json`, `vite|webpack|next.config.*`, `tsconfig*.json`, Docker, GH workflows, Cargo/go/pyproject. **Omits** `vitest.config.*`, `jest.config.*`, `eslint.config.*`, `.env*`, Turbo/Nx, etc. |
| Risk formula | `55 * reachRatio + min(30, direct*5) + (no tests in radius ? 15 : 0)`, then critical boost/floor. Empty radius → **15** from the untested penalty alone → UI **Low** (`< 20`). |
| Safe delete | `safe = blockers.length === 0 && !critical`. Non-critical leaf with 0 importers → **Safe to Delete**. |
| Intelligence Testing report | Detects Vitest via deps/scripts/**config basename** ([`testing/report.ts`](../../packages/intelligence/src/testing/report.ts)) but **does not feed soft edges into impact**. |

### 2.2 Concrete failure for `packages/ai/vitest.config.ts`

1. Almost nothing **imports** the config file → reverse graph empty.
2. Basename is **not** in `isRepoCriticalPath` → no High floor (60), no synthetic config blocker, no `config-change` danger hint from blast.
3. Formula yields **risk ≈ 15** → “Low Impact”.
4. UI rationale emphasizes “0 downstream / 0 direct dependents” — **import lane is the whole story**.

M-046 already shipped bands + a critical-path heuristic for *some* configs; Phase 8 / M-049 generalizes that into **explicit soft-signal lanes** with evidence, not only a basename floor.

---

## 3. Product principles

1. **Hard edges vs soft signals** — Import/re-export reachability stays authoritative for delete/rename blockers. Soft signals (config consumers, CI, env) are first-class but labeled with **confidence** and **evidence**.
2. **Never imply “safe” from an empty import graph alone** when soft lanes are present or the root is tooling-critical.
3. **Evidence over magic** — Every soft hit cites path, reason, category, and confidence.
4. **Surfaces stay behind `@prism/core`** — engines live in `@prism/impact` + `@prism/intelligence`; UI/MCP/CLI only consume DTOs.
5. **Deterministic & local-first** — no network; best-effort parsing; truncation markers when incomplete.
6. **Phased delivery** — ship high-value config/test lanes first; deepen alias/CI later (8.1 → 8.3 on this branch).

---

## 4. Analysis kinds (lanes)

Each lane produces zero or more **ImpactSignal**s (proposed shared shape) that merge into the blast report. Hard lanes remain usable alone for M-020 compatibility.

### Lane A — Import / export dependents (existing, hard)

- Reverse BFS on `import` / `re-export` edges.
- Categories: `import`, `reexport`, `test`, `type` (as today).
- Confidence: **high**.

### Lane B — Config consumers (soft → primary fix for Vitest)

Parse known tool configs and emit edges **config → matched files / packages / scripts**:

| Config family | Signals to emit |
|---|---|
| Vitest / Jest / Playwright / Mocha | `include` / `testMatch` / `testRegex` globs → matched test files; `setupFiles` / `globalSetup` / `setupFilesAfterEnv`; `projects` / workspace configs; `environment` / `pool` as advisory |
| Vite / Webpack / Next / Rolldown | `entry` / `input` / plugin roots; `envDir`; aliased resolve (link Lane F) |
| ESLint / Prettier / Oxlint | `files` / `ignores` globs; `extends` chains (repo-local only) |
| `tsconfig*.json` | `include` / `exclude` / `references` / `files`; project reference fan-out |
| TypeDoc / Storybook / etc. (later) | Same pattern: globs + entrypoints |

**When origin is the config:** affected = files/scripts matched by that config (depth 1 soft), plus package scripts that invoke the tool.

**When origin is a matched file:** reverse soft edge → “loaded/covered by config X” (for test-impact and rename awareness).

Confidence: **medium** for glob matches; **high** for explicit path lists / setupFiles.

### Lane C — Package manifest & workspace scripts (soft + hard-ish)

| Origin | Signals |
|---|---|
| `package.json` | Scripts that reference tools; `dependencies` / `devDependencies` / `peerDependencies` / `exports` / `bin`; workspace members that depend on this package name |
| `pnpm-workspace.yaml` / npm/yarn workspaces / Bun workspaces | Member package roots |
| Lockfiles | Advisory only (large blast; phase later or summarize) |

Confidence: **high** for direct dep edges between workspace packages; **medium** for script string matches.

### Lane D — Test discovery / runner impact (soft)

- Union of: hard reverse dependents that are tests **+** soft matches from Lane B **+** colocated naming heuristics (`*.test.*` next to origin) with lower confidence.
- Feeds `testsLikelyAffected` and Test Impact so config edits list real suites.
- Reuse intelligence Testing report runner detection as a **catalog**, not as the only signal.

### Lane E — Env / CI / container / task-graph (soft)

| Kind | Signals |
|---|---|
| `.env`, `.env.*`, `*.env.example` | Files/scripts that read matching keys (best-effort string/heuristic); package scripts using `dotenv` |
| `.github/workflows/*`, GitLab CI, etc. | Jobs that `uses:` / path-filter / `working-directory` / script steps referencing the origin path or package |
| `Dockerfile*` | `COPY`/`ADD` of origin; `RUN` that invokes package scripts |
| `turbo.json` / `nx.json` / project.json | Task `dependsOn` / `inputs` / `outputs` referencing origin |

Confidence: **low–medium**; always show evidence strings. Prefer package-scoped over repo-wide false positives.

### Lane F — Re-export / barrel / path-alias (hard enrichment)

- Keep existing `re-export` hard edges.
- Resolve `compilerOptions.paths` and (optional) `package.json#imports` when building the dependency graph so `@/` / workspace aliases become **hard** import edges when possible.
- Barrel depth: optional attribute `viaBarrel: true` when path crossed an `index.ts` re-export (UX + scoring).

Confidence: **high** when resolved to indexed file; unresolved alias stays unresolved (no fake edges).

### Lane G — Type-only vs runtime (hard attribute)

- Prefer analyzer/edge attrs when available (`import type`, `export type`, `import()`).
- Until analyzer exposes this reliably: treat `*.d.ts` as type (already); mark edges with `typeOnly?: boolean` when detectable.
- Scoring: type-only fan-in can count toward rename/edit sites but optionally **discount** runtime risk.

Confidence: **medium** until deep-TS / richer Oxc attrs (see Q-015 / ADR-0009).

### Lane H — Soft signals with confidence & evidence (cross-cutting)

Every non-hard hit carries:

```ts
{
  path: string;                 // affected or consumer path
  lane: ImpactLane;             // import | config | package | test | env | ci | alias | …
  reason: string;               // human-readable
  depth: number;
  category: BlastImpactCategory; // extend as needed
  confidence: "high" | "medium" | "low";
  evidence: string[];           // e.g. ["vitest.config.ts#include", "glob: src/**/*.test.ts"]
}
```

Hard import items can omit confidence (default `high`) for backward compatibility.

---

## 5. Core / shared / engine API changes

### 5.1 `@prism/shared` (contracts)

- Extend `BlastRadiusItem` (or add parallel `signals[]` on the report) with optional `lane`, `confidence`, `evidence`.
- Extend `BlastImpactCategory` / add `ImpactLane` enum as needed (`env`, `ci`, `script`, `workspace` — avoid overloading unused `runtime` without definition).
- Extend `BlastRadiusReport` with:
  - `lanes: { id, label, count, maxConfidence }[]` summary
  - `coverageNote?` when soft analysis truncated / unsupported config dialect
  - keep `affectedFiles` as **union** (hard ∪ soft) for existing UI, or split `hardAffected` + `softAffected` with a documented merge helper
- `SafeDeleteReport`: `safe` must consider **toolingCritical** + soft blockers policy (see scoring); add `softBlockers?` or mark blockers with lane/confidence.
- `TestImpactReport`: include soft-discovered tests.
- `ChangeReviewReport`: per-path lane summaries (optional Phase 8.3).
- Preserve Zod parse compatibility: new fields **optional** with defaults where possible (ADR-0019 / frozen SDK — treat as additive minor; bump guide notes).

### 5.2 `@prism/intelligence`

- Config parsers (Vitest/Jest/tsconfig/ESLint subset) → `ConfigImpactIndex` or soft edge list.
- Path-alias resolution plugged into `resolveImportTarget` / `buildDependencyGraph`.
- Optional: CI/Dockerfile/turbo extractors (Phase 8.3).
- Reuse Testing report runner catalog for “which configs matter”.

### 5.3 `@prism/impact`

- `computeAffected` accepts optional `softEdges` / `ImpactContext.softGraph`.
- Merge hard + soft in blast/test/safe-delete with explicit policies.
- Expand `isRepoCriticalPath` → **`classifyToolingRoot(path): ToolingCriticality`** (none | elevated | critical) covering Vitest/Jest/ESLint/env/CI/etc.
- Rescore risk (section 7).
- Keep golden fixtures for hard-only behavior; add new goldens for soft lanes.

### 5.4 `@prism/core`

- `blastRadius` / `safeDelete` / `testImpact` / `renameImpact` / `reviewChanges` continue to be the **only** surface APIs.
- Optional input flags later: `{ maxDepth?, includeSoft?: boolean }` (default soft **on** once shipped).
- Build impact context: dependency graph + soft index from intelligence; no analysis reimplemented in extension.

### 5.5 Out of Core scope (this phase)

- Auto-fix / codemods
- Cross-repo published consumers
- ML risk models (M-035)
- Full Node module resolution / pnpm virtual store

---

## 6. UX — multi-lane Blast Radius UI

**Owner:** `@prism/app-shell` `BlastRadiusScreen` (ADR-0021). Map selection rings stay selection affordance only.

### 6.1 Hero summary (always)

When soft or tooling-critical signals exist, **do not** lead with “0 dependents” as the story.

Proposed summary strip:

| Metric | Meaning |
|---|---|
| Risk band + score | Recalibrated (section 7) |
| Hard dependents | Import/re-export count (today’s “dependents”) |
| Soft impacts | Config/CI/env/script matches |
| Tests in radius | Hard ∪ soft |
| Safe delete verdict | Explicit: Safe / Blocked (imports) / **Tooling risk** (critical root or soft blockers) |

Empty hard graph + tooling critical → headline like **“High tooling impact — few import edges”** with explanation, not “isolated change surface”.

### 6.2 Lanes as sections (not only category chips)

Ordered sections (collapse empty):

1. **Import dependents** (hard)
2. **Re-exports / barrels** (hard)
3. **Config & tooling consumers** (soft) — *primary for vitest.config*
4. **Package / workspace / scripts** (soft)
5. **Tests to run** (merged)
6. **CI / Docker / task graph** (soft)
7. **Type-only references** (hard, discounted)

Each row: path · reason · confidence badge · evidence tooltip · depth.

Category chips remain as filters across lanes.

### 6.3 Evidence & confidence

- Confidence: High / Medium / Low (text + subtle tone; avoid emoji).
- Evidence: short list in tooltip or expandable row (“matched `include: src/**/*.test.ts`”).
- Breaking-change hints: keep severity ladder; add kinds e.g. `tooling-config`, `test-runner-config`, `ci-path-filter`, `workspace-dep`.

### 6.4 Safe Delete copy

| Situation | Verdict copy |
|---|---|
| No hard blockers, not tooling-critical, no soft blockers | Safe to delete |
| Hard blockers | Not safe — N dependents |
| Tooling-critical / soft blockers only | **Not safe to delete** — tooling/config impact (even with 0 import dependents) |
| Mixed | Not safe — show both lists |

### 6.5 Change Review alignment

Unify risk band thresholds with Blast (today Blast 60/20 vs Change Review 70/35 — pick one, document). Per-path row should show hard count + soft count so multi-file review doesn’t hide config risk.

### 6.6 Forward impact (optional Phase 8.3)

M-020 mentioned forward (“what I depend on”). Defer to a collapsible “This file depends on…” panel; not required for the Vitest hero fix.

---

## 7. Scoring — risk must rise for tooling roots

### 7.1 Problems with current formula

- Empty radius → floor **15** (untested penalty) looks like “mostly fine”.
- Critical boost only for a short basename list; Vitest excluded.
- Soft fan-out invisible to `reachRatio` / `directDependents`.

### 7.2 Proposed scoring (deterministic)

Let:

- `H` = hard affected count (unique paths)
- `S` = soft affected count (unique paths not already in H)
- `D_h` = hard depth-1 count
- `D_s` = soft depth-1 count (config matches, etc.)
- `T` = tests in radius (hard ∪ soft)
- `C` = tooling criticality of **origin** (`none` | `elevated` | `critical`)

```text
reach = (H + α*S) / max(1, analyzedFiles - 1)     // α ≈ 0.5 so soft doesn’t dominate huge globs
fanIn = min(30, D_h * 5 + D_s * 3)
testTerm = T > 0 ? 0 : (C != none ? 0 : 15)       // don’t “punish” missing tests on configs the same way
base = 55 * reach + fanIn + testTerm

if C == critical:  risk = max(base + 25, 70)      // High band; stronger than today’s 60 floor
if C == elevated:  risk = max(base + 15, 45)      // at least Mid
else:              risk = clamp(base, 0, 100)
```

Cap soft contribution when glob matches > N (e.g. 500) and set `truncated` / `coverageNote`.

### 7.3 Tooling criticality catalog (initial)

| Class | Examples | Criticality |
|---|---|---|
| Manifest / workspace | `package.json`, workspace yaml | critical |
| Bundler root | `vite|webpack|next.config.*` | critical |
| TS project | `tsconfig*.json` | critical |
| Test runner config | `vitest|jest|playwright.config.*`, `.mocharc*` | **critical** (fix for Vitest bug) |
| Lint/format root | `eslint.config.*`, `.eslintrc*`, `prettier.config.*`, `.oxlintrc*` | elevated |
| CI / Docker | workflows, `Dockerfile*` | critical |
| Env | `.env`, `.env.*` | elevated–critical (keys matter; start elevated) |
| Task graph | `turbo.json`, `nx.json` | elevated |

Exact lists live in one shared module used by impact **and** app-shell (stop duplicating `isRepoCriticalPath` in UI).

### 7.4 Safe delete policy

`safe === false` when any of:

- hard blockers exist, or
- `C != none` for file origins, or
- soft blockers with `confidence !== "low"` (policy flag; low-confidence soft alone → warning, not hard block — **Q-022** default).

---

## 8. Milestone phases (on this branch)

| Phase | Scope |
|---|---|
| **8.0** | Contracts & ADR-0027 Accepted |
| **8.1** | Vitest/Jest hero (MUST) |
| **8.2** | tsconfig / package.json / aliases |
| **8.3** | CI / Docker / turbo + Change Review 60/20 |

---

## 9. Definition of Done

- [x] Phase 8.1 exit criteria met (Vitest/Jest Mid/High, lanes populated, not Safe to Delete)
- [x] ADR-0027 Accepted (Option B)
- [x] Additive DTOs + CORE_SDK notes
- [x] Phase 8.2–8.3 depth polish on branch: Prettier/Mocha/Cypress/Nx project.json/Jenkinsfile/Azure path filters; lockfile advisory; file-role classifier; edit/delete intent; soft-index cache; forward-deps + scenario checklist; dynamic `import()` enrichment
- [x] `bun run verify:milestone` green (run before owner review)
- [ ] Owner approval → commit → merge → Verified
- [ ] PROGRESS + Master Plan updated (In Progress; Verified after merge)

### Remaining out of scope (do not expand here)

- Cloud analysis / LLM-as-analyzer
- Cross-repo published npm consumers
- Full TypeScript program / perfect Vite·ESLint plugin graphs
- Lockfile-line blast expansion (advisory only, by design)
- Perfect every stack dialect

---

## 10. Verification ideas

| Kind | Idea |
|---|---|
| Unit | Criticality catalog includes `vitest.config.ts`; scoring floors |
| Unit | Soft edge builder: include glob → fixture tests |
| Unit | Safe delete tooling-critical with 0 hard blockers → `safe: false` |
| Integration | Core `blastRadius` on fixture `vitest.config.ts` → soft tests + risk ≥ Mid/High |
| Golden | Update/add `blast-radius-*.golden.json` for soft cases |
| Regression | Existing `m011-refs` hard blast/safe-delete goldens unchanged |
| Manual | Open Prism on this repo → Blast on `packages/*/vitest.config.ts` → lanes populated |
| Manual | `package.json` / `tsconfig` / workflow still High |
| UX | Empty hard + soft present → no “isolated / safe” false comfort |
| Perf | Soft index build bounded; large monorepo glob cap + truncation flag |

---

## 11. Risks & open questions

| Risk / question | Mitigation / default |
|---|---|
| Glob false positives inflate risk | Cap soft matches; α&lt;1; confidence medium; truncation note |
| Config dialect sprawl | Phase 8.1: Vitest+Jest first; parser SPI-shaped helpers |
| SDK freeze (M-025) / additive DTOs | Optional fields only; document in CORE_SDK |
| Duplicate criticality lists (impact vs UI) | Single shared export via Core DTO metadata or shared helper in `@prism/shared` |
| Soft blockers vs Safe Delete strictness | **Q-022** — default: medium+ soft blocks delete; low = warn |
| Alias resolution complexity | Best-effort paths only; no full TS program |
| Analyzer type-only gaps | Attribute when known; don’t block Phase 8.1 |
| Change Review band mismatch | Unify in Phase 8.3 (or 8.1 if cheap) — **Q-023**: Blast 60/20 |

See also [OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md) **Q-022**, **Q-023**.

---

## 12. Sequencing

```text
milestone/M-049-blast-radius-depth (from latest main)
  → Accept ADR-0027 Option B
  → Phase 8.0–8.1 (hero) → verify
  → Phase 8.2–8.3 on same branch unless cut
  → owner review (no commit until approved)
```

---

## 13. References

- M-020 / M-021 milestone docs (hard reverse-dep primitives)
- M-046 Blast bands + initial config heuristic
- M-048 Phases 0–7 Verified; Phase 8 deferred here
- ADR-0004 Core-only surfaces · ADR-0019 SDK versioning · ADR-0021 app-shell · ADR-0022 testing reports · ADR-0026 watch invalidation · ADR-0027 multi-lane signals
- Code: `packages/impact/src/{blast-radius,change-impact,internal}.ts`, `packages/intelligence/src/dependency/*`, `packages/app-shell/src/BlastRadiusScreen.tsx`

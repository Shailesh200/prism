# M-048 — Extension Product Epic

| Field | Value |
|---|---|
| Branch | `milestone/M-048-extension-polish` |
| Status | Verified |
| Depends on | M-047 |
| Unlocks | Editor-native Prism loop before MCP (M-026); reliable Blast Radius hero |
| Packages | `@prism/vscode-extension`, `@prism/app-shell`, `@prism/ui`, `@prism/core`, `@prism/indexer`, `@prism/intelligence`, `@prism/impact`, `@prism/repository-map`, `@prism/shared` |
| Supersedes | **M-033 Incremental Watch** (Phase 1) |
| Related ADR | [ADR-0026](../adr/0026-incremental-watch-invalidation.md); [ADR-0027](../adr/0027-blast-radius-multi-lane-signals.md) (Accepted on M-049) |
| Phase 8 note | Blast Radius Depth was planned as Phase 8 here; **implementation moved to** [`M-049`](./M-049_blast-radius-depth.md) / `milestone/M-049-blast-radius-depth` after this epic Verified |

## Goal

Ship Necessary + High-leverage extension product features in one expanded milestone:
polish (foreign-repo UX), full incremental watch orchestration, editor surfaces,
trust/onboarding/deep links, change-review panel, explain-area cards, bookmark
persistence, package + multi-root pickers, health regression alerts, **and
multi-lane Blast Radius depth** (config/tooling soft signals + honest scoring)
so the hero impact surface is trustworthy.

## In Scope

### Phase 0 — Polish (done)
- Silent index, map inspector overlay, DNA/Next/testing/security/Trends/.gitignore
- GitHub App integration tile (coming soon)
- Ownership from git (files + folders), light-mode token remaps, Domains stack chips
- In-app tour; no auto-open panel / indexed toast on boot

### Phase 1 — Incremental Watch (done)
- Core `startWatch` / `stopWatch` / `getIndexFreshness`
- Dirty-path index option (skip full walk when possible)
- Extension FS events → Core watch; status `fresh` \| `stale` \| `indexing`
- ADR-0026 for invalidation unit

### Phase 2 — Editor surfaces (done)
- Commands + context menus: Blast, Safe Delete, Ownership, Reveal on Map, Explain
- Optional CodeLens (off by default)

### Phase 3 — Trust / onboarding / deep links (done)
- Status bar trust states + tooltip + quick pick
- First-run in-app tour (Next / Previous / Skip)
- Reveal-on-map host↔webview

### Phase 4 — Change Review (done)
- `reviewChanges({ paths })` aggregate + Change Review screen + SCM entry

### Phase 5 — Explain area (done)
- Deterministic module/folder summary card (DNA + deps + ownership)

### Phase 6 — Persist & scope (done)
- `.prism/bookmarks.json` persistence
- Package picker (`listPackages` / `selectPackage`)
- Multi-root workspace folder picker

### Phase 7 — Health alerts (done)
- Local toast on score drop / regressing movers (debounced)

### Phase 8 — Blast Radius Depth (**deferred → M-049**)

> **Status:** Design lived here as Phase 8; **product implementation** is on [`M-049`](./M-049_blast-radius-depth.md) (`milestone/M-049-blast-radius-depth`). This epic (Phases 0–7) remains Verified.

> **User problem:** `vitest.config.ts` shows Low Impact (15), 0 dependents, Safe to Delete — import-only graph + narrow critical-path list. Hero feature needs multi-lane detail.

**Principles:** hard import/re-export stay authoritative; soft signals (config/CI/env/scripts) carry confidence + evidence; never imply “safe” from an empty import graph alone when tooling-critical or soft blockers exist; surfaces stay behind `@prism/core`.

**Related:** ADR-0027 · OPEN_QUESTIONS Q-022 / Q-023 · [`M-049_blast-radius-depth.md`](./M-049_blast-radius-depth.md) (active implementation + design archive).

#### Phase 8.0 — Contracts & ADR
- Accept ADR-0027 direction
- Additive Zod/`BlastRadiusReport` fields (`lane`, `confidence`, `evidence`, `lanes[]` summary); CORE_SDK notes

#### Phase 8.1 — Tooling criticality + Vitest/Jest soft lane (hero fix)
- Expand `isRepoCriticalPath` → tooling criticality catalog (include Vitest/Jest/ESLint/…)
- Soft edges: Vitest + Jest config → globs/setupFiles → matched tests/files
- Rescore + safe-delete policy (tooling-critical never “safe” on empty import graph)
- Blast UI: multi-lane sections + “tooling impact” empty-hard state
- Goldens: fixture with `vitest.config.ts` include globs

**Exit:** Vitest/Jest-class paths show Mid/High tooling impact, non-empty Config/Tests lane, **not** Safe to Delete.

#### Phase 8.2 — tsconfig + package.json + path aliases
- `tsconfig` include/references soft edges; workspace package/script impact
- Alias resolution in dependency graph (best-effort hard edges)
- Type-only edge attributes where cheap

#### Phase 8.3 — CI / Docker / Turbo·Nx + Change Review parity
- Workflow / Dockerfile / turbo soft signals
- Unify risk bands (Q-023: prefer Blast 60/20)
- Optional forward-deps panel; MCP/CLI field docs deferred to later milestones

#### Phase 8 analysis lanes (summary)

| Lane | Kind | Notes |
|---|---|---|
| A Import/export | Hard | Existing reverse BFS |
| B Config consumers | Soft | Vitest/Jest first; vite/next/eslint/tsconfig later |
| C Package/workspace | Soft | scripts, workspace deps |
| D Test discovery | Soft | hard tests ∪ config globs ∪ colocated heuristics |
| E Env / CI / Docker / task | Soft | Phase 8.3 |
| F Alias / barrel | Hard enrich | paths / `#imports` best-effort |
| G Type-only | Hard attr | discount runtime risk when known |

#### Phase 8 scoring (sketch)

- Soft matches contribute to reach/fan-in with α &lt; 1 and caps/truncation
- `critical` tooling origin → floor High (~70); `elevated` → at least Mid (~45)
- Safe delete false when hard blockers **or** tooling-critical **or** medium+ soft blockers (Q-022)

Full mechanics, DTO shapes, UX copy tables, verification matrix: see [M-049 design archive](./M-049_blast-radius-depth.md) §§2–11 (status: absorbed into M-048 Phase 8).

## Out of Scope

- MCP / CLI (M-026+)
- Tree-sitter (M-034)
- Live GitHub App (tile stays Coming soon)
- LLM-written explanations
- Marketplace republish (follow-up)
- Perfect glob semantics for every runner; lockfile-wide blast; published npm consumers

## Definition of Done

- [x] Phases 0–7 implemented
- [x] Spotlight Getting Started tour (owner-verified)
- [x] Phase 8 product work deferred to **M-049** (this epic Verified without Phase 8.1)
- [x] `bun run verify:milestone` green for shipped scope (Phases 0–7 + tour)
- [x] Owner approval → commit → merge → Verified
- [x] M-033 marked Deferred/superseded in PROGRESS
- [x] M-049 revived In Progress for blast depth implementation (was Absorbed design-only)

## Verification

`bun run verify:milestone` · Manual smoke: watch edit → stale/ready; context menus;
tour; SCM review; bookmarks persist; package + multi-root; health toast;
**Blast on `**/vitest.config.ts` → tooling lanes + not Safe to Delete**; light mode;
Domains stack chips

## Soft defaults

- CodeLens off by default
- Change review base: `origin/main` → `main` → `master` → `HEAD~1`
- Health alert: ≥5 pt drop or regressing movers; one toast per signature/session
- Soft blast: on by default once Phase 8.1 ships; soft match cap + truncation flag

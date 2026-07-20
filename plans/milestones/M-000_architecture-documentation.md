# M-000 — Architecture Documentation (HLD / LLD / Tech)

| Field | Value |
|---|---|
| Branch | `milestone/M-000-architecture-docs` |
| Status | In Progress |
| Depends on | Master Plan **Approved** |
| Unlocks | M-001 |
| Packages touched | none (docs only under `plans/architecture/`) |

## Goal

Produce a complete, owner-approved **architecture documentation pack** so implementation (M-001+) follows a clear HLD, LLD, tech-stack rationale, and folder structure — **before any product code**.

## In Scope

Create `plans/architecture/` with:

1. **`01_HLD.md` — High-Level Design**
   - Product context (what Prism is / is not)
   - System context diagram (humans, agents, Core, FS, SQLite)
   - Deliverables & surfaces (Core, MCP, CLI, VS Code, Cursor, Playground)
   - Major subsystems (indexer, analyzer, graphs, intelligence, impact, map, navigation)
   - Cross-cutting: local-first, privacy, offline, AI-agnostic
   - Quality attributes (perf, extensibility, testability)

2. **`02_LLD.md` — Low-Level Design**
   - Package boundaries and dependency direction (`surfaces → core → engines`)
   - Public Core SDK surface (outline; finalized in M-002/M-025)
   - Index pipeline (walk → hash → parse → extract → persist)
   - Graph construction & query primitives (ngraph)
   - Impact / blast-radius flow
   - Error / Result model outline
   - Plugin SPI sketch (language analyzers)
   - Sequence notes for “open repo → map → blast radius”

3. **`03_TECH_STACK.md` — Tech stack deep-dive**
   - Locked choices from ADR-0003 (table + rationale)
   - Why Bun + Node 26 + moonrepo
   - Why Oxc (v1) / Tree-sitter (later) / optional ts-morph
   - Why ngraph, better-sqlite3, React Flow, Oxlint/Oxfmt, Vitest, Lefthook
   - Explicit non-goals / rejected alternatives (short)
   - Toolchain constraints for VS Code extension host (Node-compatible Core)

4. **`04_FOLDER_STRUCTURE.md` — Repository & package layout**
   - Canonical tree (apps / packages / plans / scripts / fixtures)
   - Ownership per directory
   - Naming (`@prism/*`, milestone branches)
   - Where brand assets live (`plans/mockups/logo/`)
   - Align with [`../STRUCTURE.md`](../STRUCTURE.md); this doc is the detailed SoT for implementers

5. **`05_DATA_FLOWS.md` — Data & control flows**
   - Mermaid (or equivalent) for index, incremental update, Core query, MCP tool call, CLI command
   - Cache read/write paths
   - What never leaves the machine by default

6. **`06_PACKAGE_RESPONSIBILITIES.md` — Package RACI-style map**
   - For each `@prism/*`: owns / depends on / must not contain
   - Reinforces “surfaces call Core only”

Also update:

- [`../STRUCTURE.md`](../STRUCTURE.md) if the detailed folder doc supersedes any stub wording
- [`../PROGRESS.md`](../PROGRESS.md) — M-000 → Verified after owner approval
- Cross-links from Master Plan / START_HERE (already planned)

## Out of Scope

- Any application / package source code
- `bun install`, moon setup, or `verify:milestone` scripts (those are **M-001**)
- Publishing docs site (M-038)
- Regenerating brand assets
- Expanding product feature scope beyond Master Plan

## Deliverables

1. All six markdown files under `plans/architecture/`
2. Diagrams where useful (Mermaid in-markdown preferred)
3. Docs consistent with Master Plan, ADR-0003, DESIGN_SYSTEM, LOCKED brand
4. Owner sign-off recorded in this milestone (below) + PROGRESS

## Definition of Done

- [ ] `plans/architecture/01_HLD.md` complete and reviewed
- [ ] `plans/architecture/02_LLD.md` complete and reviewed
- [ ] `plans/architecture/03_TECH_STACK.md` complete and reviewed
- [ ] `plans/architecture/04_FOLDER_STRUCTURE.md` complete and reviewed
- [ ] `plans/architecture/05_DATA_FLOWS.md` complete and reviewed
- [ ] `plans/architecture/06_PACKAGE_RESPONSIBILITIES.md` complete and reviewed
- [ ] No contradictions with Master Plan / ADR-0003 / STRUCTURE
- [ ] `plans/PROGRESS.md` updated
- [ ] Owner approval: **approved to merge M-000** (docs-only merge to main)
- [ ] Explicit go-ahead to start **M-001**

## Verification (docs milestone)

M-000 does **not** run `bun run verify:milestone` (no toolchain yet).

Owner review checklist:

- [ ] HLD understandable by a new engineer in one sitting
- [ ] LLD clear enough to implement M-001–M-003 without guessing package boundaries
- [ ] Tech stack doc matches locked ADR-0003
- [ ] Folder structure ready to scaffold in M-001
- [ ] Data flows cover Core + at least one surface path (MCP or CLI)

## Manual verification

- [ ] Open `plans/architecture/` end-to-end
- [ ] Spot-check links to ADRs / Master Plan / DESIGN_SYSTEM

## Owner approval

| Field | Value |
|---|---|
| Approved by | |
| Date | |
| Decision | ☐ Approved to merge / ☐ Changes requested |
| Start M-001 | ☐ Yes after merge |

## Notes

- Prefer clarity over length; diagrams over prose walls.
- If an architectural fork appears, open an ADR — do not silently diverge in these docs.

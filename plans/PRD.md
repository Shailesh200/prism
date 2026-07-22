# Prism — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Product | **Prism** (formerly working name RepoPulse) |
| Document type | End-to-end Product Requirements |
| Status | Living — aligned to Master Plan **APPROVED** 2026-07-20 |
| Version | 1.0.0 |
| Last updated | 2026-07-22 |
| Canonical plan | [`00_MASTER_DEVELOPMENT_PLAN.md`](./00_MASTER_DEVELOPMENT_PLAN.md) |
| Progress | [`PROGRESS.md`](./PROGRESS.md) |
| Architecture | [`architecture/`](./architecture/) |
| Design | [`mockups/DESIGN.md`](./mockups/DESIGN.md) · [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) |
| UX rules | [`UX_SIMPLICITY.md`](./UX_SIMPLICITY.md) |

> This PRD describes **what Prism is**, **who it serves**, **what ships**, and **what comes next**. Implementation detail and milestone DoDs live in the Master Plan and per-milestone docs. If this PRD and the Master Plan disagree, **reconcile the plan first**.

---

## 1. Problem statement

Modern repositories are too large and too multi-package for humans (and AI agents) to hold in working memory. Developers and agents routinely:

- Open a monorepo and cannot answer “where does Billing live?”
- Change a symbol without knowing who depends on it
- Guess at architecture drift, debt, and test risk
- Re-ask the same structural questions of every new LLM chat, with no durable local intelligence

Existing tools solve fragments (search, git blame, dependency linters, IDE outlines) but not a **unified, local, agent-ready intelligence layer**.

---

## 2. Vision

> **Google Maps + Engineering Intelligence + MCP Tools for Software**

Prism is a **local-first Software Intelligence Engine** that makes any repository:

1. **Spatially navigable** — Repository Map with zoom levels and features  
2. **Analytically queryable** — graphs, DNA, health, impact, explorer  
3. **Safe to change** — blast radius, safe-delete / rename / test impact  
4. **Agent-ready** — same answers via MCP, CLI, and IDE  

### What Prism is

| Prism is | Prism is not |
|---|---|
| Local analysis engine | An AI coding assistant / chat product |
| Maps, graphs, impact, health | An LLM product or model host |
| Thin surfaces over one Core | A cloud SaaS (optional post-GA only) |
| Offline & privacy-first by default | A network-dependent workflow |

---

## 3. Product principles

| Principle | Meaning |
|---|---|
| Local-first | Analysis runs on the developer machine |
| Offline-first | Core workflows need no network |
| Privacy-first | Source never leaves the machine unless the user opts in |
| AI-agnostic | Core has no LLM vendor coupling |
| Framework-agnostic | Detect frameworks; never hard-require one |
| Zero required cloud | Cloud features (if any) are optional and post-GA |
| Zero vendor lock-in | Open contracts, portable cache, exportable graphs |
| One shared Core | MCP / CLI / VS Code / Cursor / Playground call `@prism/core` only |
| Extensible plugins | Languages & detectors are SPI plugins |
| Production quality | Strict TS, tests, verify gates, ADRs |
| Cross-platform | macOS, Linux, Windows |
| One job per screen | Progressive disclosure; selection unlocks the next job |

---

## 4. Personas & jobs-to-be-done

### 4.1 Personas

| Persona | Needs |
|---|---|
| **IC developer** | Orient in a large repo; open the right files; check impact before a change |
| **Tech lead / reviewer** | See coupling, hotspots, debt, architecture drift |
| **AI coding agent** | Structured, deterministic repo facts via MCP (map, health, blast radius) |
| **CI / platform** | Scriptable health / impact checks without an IDE |

### 4.2 Primary jobs

| Job | Human surface | Agent / script surface |
|---|---|---|
| Orient & go somewhere | Repository Map | `repository_map` / `prism map` |
| Understand this thing | Code Explorer + Inspector | explorer / references tools |
| See what breaks | Blast Radius | `blast_radius` / `prism blast-radius` |
| See where the pain is | Health + Map layers | `repository_health` / insights |
| Profile the stack | DNA / Intelligence | `repository_dna` / `prism dna` |
| Change safely | Safe delete / rename | `safe_delete` / `rename_impact` |

---

## 5. Product surfaces

```text
┌─────────────────────────────────────────────────────────────┐
│  Surfaces: VS Code │ Cursor │ MCP │ CLI │ Playground        │
└───────────────────────────┬─────────────────────────────────┘
                            │ @prism/core (public SDK only)
┌───────────────────────────▼─────────────────────────────────┐
│  Intelligence │ Impact │ Navigation │ Repository Map         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Graph Engine  │  Indexer  │  Analyzer (language plugins)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  SQLite cache (.prism/) │ Workspace FS │ Git metadata (opt)  │
└─────────────────────────────────────────────────────────────┘
```

| Surface | Role | Status (as of 2026-07-22) |
|---|---|---|
| **@prism/core** | Public SDK façade | **Shipped** (skeleton → intelligence → map APIs) |
| **Playground** | Interactive Map demo (Vite) | **Shipped** (M-018); premium UI in progress (M-042) |
| **@prism/ui** | Shared React Map / panels | **Shipped** v1; **v2 in progress** (M-042) |
| **MCP Server** | Tools for agents | Planned (M-026 / M-027) |
| **CLI** | `prism` for scripts / CI | Planned (M-028 / M-029) |
| **VS Code Extension** | Human IDE Map + explorer | Planned (M-030 / M-031) |
| **Cursor Extension** | Thin packaging / branding | Planned (M-032) |
| **Docs site** | Install + guides | Planned (M-038) |

**Hard rule:** surfaces never reimplement analysis. They consume Core DTOs only.

---

## 6. Feature catalog

Legend: **Done** = Verified on `main` · **Active** = current milestone · **Next** = near-term · **Later** = roadmap · **Deferred** = parked by owner

### 6.1 Foundation & analysis core — Done

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Architecture docs (HLD/LLD/tech) | M-000 | Pre-code design pack |
| Monorepo foundation | M-001 | Bun, moon, Oxlint/Oxfmt, Lefthook, verify gates |
| Shared contracts | M-002 | Result / PrismError / IDs / Zod DTOs |
| Core skeleton | M-003 | Prism façade; ADR-0004 Core-only surface |
| Analyzer SPI | M-004 | LanguagePlugin host; ADR-0005 |
| FS / ignore / hashing | M-005 | Inventory + SHA-256 content hash |
| Stack Detector SPI | M-040 | Domains + developer personas contracts |
| AST engine TS/JS | M-006 | Oxc parse → symbols / imports / exports |
| Indexer v1 | M-007 | IndexSnapshot + IndexJob + Core `index` / `getIndex` |
| SQLite cache | M-008 | Local `.prism/` persistence; ADR-0010 |
| Graph engine | M-009 | ngraph store + graph DTOs |
| Dependency graph | M-010 | File/package deps + cycles |
| Semantic knowledge graph | M-011 | Symbols + `findReferences` |
| Feature graph | M-012 | Feature heuristics; ADR-0011 |
| Repository DNA | M-013 | Multi-domain DNA + personas |
| Intelligence API | M-014 | `intelligence()` aggregate |
| Health score v1 | M-015 | `getHealth()` 0–100 + factors; ADR-0012 |
| Navigation engine | M-016 | `findRoute` / landmarks |
| Stack-aware utilities epic | M-041 | Gate A+B (P0–P7 + Mono + overlays) |
| Map data model | M-017 | `getRepositoryMap` zoom/layers/clusters |

### 6.2 Repository Map (hero) — Done + Active

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Map UI playground | M-018 **Done** | Playground + `@prism/ui`: pan/zoom, search, feature overview, file density treemap, local-repo presets |
| Map layers & views | M-019 **Deferred** | ≥5 layers (architecture, dependency, activity, ownership, debt, risk, performance, coverage); toggle + legend — *parked; layer work carried into M-042* |
| UI System v2 (Signal Chart) | M-042 **Active** | Premium map chrome: ZoomRail, atmosphere, motion, file/symbol polish, command palette slices |
| IDE Map packaging | M-030 / M-031 **Later** | VS Code webview Map + explorer |

#### Map product requirements (human)

**Job:** Orient & go somewhere.

| Requirement | Detail |
|---|---|
| Shell | Top bar (brand · search · Views · Reindex) · one canvas · right Inspector |
| Zoom levels | Repo → Package → Feature → File → Symbol |
| Default view | Feature-first regions; progressive disclosure for layers |
| Selection CTAs | Primary **Open**; secondary **See impact** (when impact exists) |
| File density | Treemap / icicle for “where mass lives”; drill by folder; file-type coloring |
| Search | “Find a feature or file…” |
| Bookmarks / landmarks | Persistible orientation aids (model in M-017; UI polish ongoing) |
| Design | Signal Chart: teal `#0F766E`, Satoshi + IBM Plex Mono, light-first |
| Deferred polish | Treemap transition animation (owner: revisit after feature work) |

#### Map UX ladder

```text
Level 0  Open Map → features + search
Level 1  Select → inspector (files, Open, See impact)
Level 2  Views → one layer concern at a time
Level 3  Power → routes, bookmarks, landmarks, command palette
```

### 6.3 Change impact — Next / Later

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Blast radius | M-020 | Transitive dependents, depth limits, risk heuristic, Core `blastRadius` |
| Safe delete / rename / test impact | M-021 | `safeDelete`, `renameImpact`, `testImpact`, `breakingChangeHints` |

### 6.4 Health, explorer, insights — Later

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Engineering health metrics | M-022 | Entropy, drift, debt, churn, hotspots, knowledge decay, conflict risk |
| Code Explorer queries | M-023 | Usages, ownership, related *, similar impl, git timeline |
| Engineering insights | M-024 | Ranked lists with evidence (hotspots, coupling, review risk) |

### 6.5 Core freeze & surfaces — Later

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Core SDK freeze v0 | M-025 | Stabilize public `@prism/core` for surfaces |
| MCP foundation | M-026 | Stdio MCP server; thin Core adapters |
| MCP tools pack | M-027 | Full tool surface (see §7) |
| CLI foundation | M-028 | `prism` binary + Commander |
| CLI commands | M-029 | `analyze|map|health|dna|blast-radius|safe-delete|insights` |
| VS Code shell | M-030 | Extension host, webview shell, Core wiring |
| VS Code Map + Explorer | M-031 | Full human Map experience in IDE |
| Cursor extension | M-032 | Packaging/brand; coexist with MCP |

### 6.6 Scale, quality, GA — Later

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Incremental index & watch | M-033 | fs watch; partial rebuild budgets |
| Multi-language (Tree-sitter) | M-034 | Additional language(s) beyond TS/JS |
| Performance hardening | M-035 | Large-repo budgets; profiling |
| Security & privacy | M-036 | Secret redaction; sensitive path ignore; no-network default |
| E2E suite | M-037 | Playwright + MCP/CLI integration |
| Docs site | M-038 | Install, concepts, Map, MCP, CLI, contributing |
| GA readiness | M-039 | Release checklist; critical path green |

---

## 7. Agent & CLI contracts (target)

Surfaces expose the **same nouns**. MCP tools (M-027) are thin wrappers over Core with JSON-serializable DTOs from `@prism/shared`.

| MCP tool | CLI analogue | Purpose |
|---|---|---|
| `repository_map` | `prism map` | Spatial / zoomed map model |
| `repository_health` | `prism health` | Score + factors |
| `repository_dna` | `prism dna` | Domains / personas / stack |
| `feature_graph` | `prism features` | Feature nodes & links |
| `dependency_graph` | (analyze/deps) | File/package deps |
| `blast_radius` | `prism blast-radius` | Change impact |
| `safe_delete` | `prism safe-delete` | Delete safety report |
| `rename_impact` | — | Rename fan-out |
| `architecture_rules` | — | Detected / declared rules |
| `dependency_route` | — | Route between nodes |
| `similar_component` | — | Structural similarity |
| `engineering_entropy` | `prism insights …` | Entropy metric |
| `technical_debt` | — | Debt hotspots |
| `hotspots` | `prism insights hotspots` | Edit / risk hotspots |
| `knowledge_decay` | — | Ownership / freshness decay |

Example human CLI output (target):

```text
Prism  ·  billing-service  ·  offline

Health  84/100
  architecture   stable
  debt           moderate (12 hotspots)
  test coupling  good

Blast radius  chargeCustomer  risk 72
  dependents   18 files · 4 features
  tests        6 likely affected
  route        billing → api → webhooks
```

---

## 8. Design system (locked)

| Token | Hex | Use |
|---|---|---|
| Brand / primary | `#0F766E` | Mark, CTA, selected regions |
| Brand strong | `#115E59` | Hover / emphasis |
| On brand | `#FFFFFF` | Text on teal |
| Ink | `#0F1C24` | Primary text |
| Ink muted | `#5A6B76` | Captions |
| Line | `#C5D0D8` | Borders |
| Panel | `#FBFCFD` | Chrome |
| Canvas | `#E8EEF2` → `#F3F7F9` | Map atmosphere |
| Risk | `#D97706` | Impact / risk only |
| Safe | `#059669` | Healthy signals (sparingly) |

| Rule | Detail |
|---|---|
| Accent | One family: **teal** — no purple/violet candy |
| Type | Satoshi (UI) · IBM Plex Mono (paths/code) |
| Shell | Top bar · one canvas · Inspector |
| Logo | Locked faceted geometric “P” |
| Theme | Light-first; dark later as token flip (M-042 prepares tokens) |

---

## 9. Technical constraints (PRD-level)

| Constraint | Choice |
|---|---|
| Language | TypeScript strict |
| Package manager | Bun workspaces |
| Tasks | moonrepo |
| JS/TS parse (v1) | Oxc |
| Graphs | ngraph |
| Cache | better-sqlite3 (Node-portable for extensions) |
| Map UI | React + Vite + React Flow (+ Highcharts for density) |
| Verify gate | `bun run verify:milestone` before owner review |
| Integration rule | Surfaces → `@prism/core` only |

---

## 10. Non-goals (GA)

Explicitly **out of scope** for GA:

- Cloud sync / multi-user hosted SaaS  
- Fine-tuning or shipping an LLM  
- Guaranteeing perfect semantic understanding of all languages  
- Auto-applying code edits (Prism advises; humans/agents edit)  
- Proprietary IDE forks beyond VS Code / Cursor  
- Rainbow “dashboard” Map first paint (violates UX simplicity)  

---

## 11. Success criteria

### 11.1 Product

| Metric | Target sense |
|---|---|
| Time-to-orient | New contributor finds a feature region in under 30s on Map |
| Impact before edit | Blast radius available for a selected file/symbol |
| Agent parity | Same Core answer in Map, CLI, and MCP for map/health/impact |
| Privacy | Core analysis runs offline by default |

### 11.2 UX (from UX_SIMPLICITY)

| Check | Pass if |
|---|---|
| First open | User knows the next click without reading a manual |
| Complexity budget | ≤1 canvas · ≤1 inspector · ≤3 top actions · ≤2 CTAs after select |
| Layers | Not all on at once; Views = one concern |

### 11.3 Engineering

| Gate | Requirement |
|---|---|
| Milestone | One `In Progress` at a time; branch `milestone/M-XXX-…` |
| Verify | `bun run verify:milestone` green before approval |
| Merge | Owner **approve** → commit → merge to `main` → mark Verified |

---

## 12. Roadmap snapshot (2026-07-22)

### Shipped (Verified on `main`)

M-000 → M-018 inclusive, plus M-040 / M-041 (Stack Detector + utilities epic).

### Active

| Milestone | Focus |
|---|---|
| **M-042 UI System v2** | Premium Signal Chart: ZoomRail, Feature canvas, File/Symbol polish, command palette |

### Deferred / parked

| Milestone | Note |
|---|---|
| **M-019 Map Layers** | Parked for M-042; layer UI carried forward on M-042 branch |
| Treemap animation polish | Owner: revisit after feature milestones |

### Immediate next (after M-042)

Typical critical-path continuation:

1. Finish / merge **M-042**  
2. Resume **M-019** layer completeness if still needed, or proceed to **M-020 Blast Radius**  
3. **M-025** Core freeze when impact + map surfaces are ready  
4. Surfaces: **M-026 MCP** · **M-028 CLI** · **M-030 VS Code**  

Critical path (Master Plan):

```text
M-001 → M-005 → M-040 → M-014 → M-041 Gate A → M-017 → M-018
  → (M-042 polish) → M-025 → M-026 / M-028 / M-030 → M-039 GA
```

---

## 13. User journeys (end-to-end)

### 13.1 Human — first open (today → GA)

1. Open Playground / IDE Map on a local workspace  
2. Index runs (or uses SQLite cache)  
3. Feature Map appears — regions for Auth, Billing, API…  
4. Search or click a feature → Inspector lists files  
5. **Open** jumps to code; later **See impact** opens Blast Radius  
6. Views → toggle Debt / Risk / Dependencies one at a time  
7. File zoom → density treemap for mass; Cards for browse-to-open  

### 13.2 Agent — impact before edit (GA)

1. Agent calls `blast_radius` on a symbol via MCP  
2. Receives dependents, features, tests, risk score (JSON)  
3. Optionally calls `safe_delete` / `rename_impact`  
4. Agent proposes edits; human/agent applies them (Prism does not auto-edit)  

### 13.3 CI — health gate (GA)

```bash
prism index --quiet
prism health --json --fail-under 70
prism blast-radius "$CHANGED_FILE" --json > impact.json
```

---

## 14. Risks & open product bets

| Risk / bet | Mitigation |
|---|---|
| Graph spaghetti on large repos | Feature-first Map; selection-only edges; density views for files |
| Layer overload | Progressive disclosure; one active view |
| Incomplete multi-lang | TS/JS v1; Tree-sitter later (M-034) |
| Impact false confidence | Heuristic risk + truncation markers; no auto-edit |
| UI polish vs velocity | M-042 review-gated slices; deferred animation |

Open questions: [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md)

---

## 15. Document ownership

| Change | Process |
|---|---|
| Scope add to active milestone | Owner approval + milestone DoD update |
| New milestone / reorder | Owner approval + Master Plan + PROGRESS |
| Public API break after M-025 | ADR + versioning policy |
| PRD corrections | Allowed with plan reconciliation |

**Sources of truth (priority):**

1. Master Development Plan  
2. Active milestone doc  
3. PROGRESS.md  
4. This PRD (product narrative)  
5. Architecture / ADRs / Design  

---

## 16. Appendix — milestone index

| ID | Name | Phase |
|---|---|---|
| M-000 | Architecture Documentation | Docs |
| M-001 | Project Foundation | Foundation |
| M-002 | Shared Contracts | Foundation |
| M-003 | Core Skeleton | Foundation |
| M-004 | Analyzer SPI | Analysis |
| M-005 | FS Ignore Hash | Analysis |
| M-040 | Stack Detector SPI | Analysis |
| M-006 | AST Engine TS | Analysis |
| M-007 | Indexer v1 | Analysis |
| M-008 | SQLite Cache | Analysis |
| M-009 | Graph Engine | Graphs |
| M-010 | Dependency Graph | Graphs |
| M-011 | Semantic KG | Graphs |
| M-012 | Feature Graph | Graphs |
| M-013 | Repository DNA | Intelligence |
| M-014 | Intelligence API | Intelligence |
| M-015 | Health Score | Intelligence |
| M-016 | Navigation Engine | Navigation |
| M-041 | Stack Utilities Epic | Intelligence |
| M-017 | Map Data Model | Map |
| M-018 | Map UI Playground | Map |
| M-019 | Map Layers | Map |
| M-042 | UI System v2 | Map / UI |
| M-020 | Blast Radius | Impact |
| M-021 | Safe Delete / Rename | Impact |
| M-022 | Eng Health Metrics | Health |
| M-023 | Code Explorer | Explorer |
| M-024 | Insights | Insights |
| M-025 | Core SDK Freeze v0 | Core |
| M-026 | MCP Server | Surfaces |
| M-027 | MCP Tools Pack | Surfaces |
| M-028 | CLI Foundation | Surfaces |
| M-029 | CLI Commands | Surfaces |
| M-030 | VS Code Shell | Surfaces |
| M-031 | VS Code Map + Explorer | Surfaces |
| M-032 | Cursor Extension | Surfaces |
| M-033 | Incremental Watch | Scale |
| M-034 | Tree-sitter | Scale |
| M-035 | Perf Hardening | Hardening |
| M-036 | Security Privacy | Hardening |
| M-037 | E2E Suite | Quality |
| M-038 | Docs Site | Docs |
| M-039 | GA Readiness | Release |

---

*End of PRD. For implementation sequencing and DoD checklists, use the Master Plan and `plans/milestones/`.*

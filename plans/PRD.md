# Prism — Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Product | **Prism** (formerly working name RepoPulse) |
| Document type | End-to-end Product Requirements |
| Status | Living — aligned to Master Plan **APPROVED** 2026-07-20 |
| Version | 1.0.0 |
| Last updated | 2026-08-05 (M-051 reconciliation) |
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

| Surface | Role | Status (as of 2026-08-05) |
|---|---|---|
| **@prism/core** | Public SDK façade | **Shipped**; API frozen at v0.1.0 (M-025, ADR-0019) |
| **Playground** | Interactive Map demo (Vite) | **Shipped** (M-018) |
| **@prism/ui** | Shared React Map / panels | **Shipped** v2 (M-042) |
| **@prism/app-shell** | Screens shared by playground + extension | **Shipped** (M-046, ADR-0021) |
| **VS Code Extension** | Human IDE Map + explorer | **Shipped** and published as `prismhq.repo-prism` (M-030 / M-031 / M-047 / M-048) |
| **Cursor Extension** | Thin packaging / branding | **Shipped** (M-032, ADR-0020) |
| **MCP Server** | Tools for agents | Planned (M-026 / M-027) — the main remaining surface |
| **CLI** | `prism` for scripts / CI | Planned (M-028 / M-029) |
| **Docs site** | Install + guides | Planned (M-038); VitePress (Q-008) |

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

### 6.2 Repository Map (hero) — Done

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Map UI playground | M-018 **Done** | Playground + `@prism/ui`: pan/zoom, search, feature overview, file density treemap, local-repo presets |
| Map layers & views | M-019 **Done** (closed out) | ≥5 layers (architecture, dependency, activity, ownership, debt, risk, performance, coverage); toggle + legend — *shipped inside M-042* |
| UI System v2 (Signal Chart) | M-042 **Done** | Dark relock (ADR-0014): KPI sidebar, edge graph, blast rings, rebuilt inspector, Overview landing |
| IDE Map packaging | M-030 / M-031 **Done** | VS Code webview Map + explorer |
| Honest layer signals | M-051 **Done** | Layers that cannot be measured render as "No data" rather than colour derived from a hash (ADR-0029) |

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

### 6.3 Change impact — Done

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Blast radius | M-020 **Done** | Transitive dependents, depth limits, risk heuristic, Core `blastRadius` |
| Safe delete / rename / test impact | M-021 **Done** | `safeDelete`, `renameImpact`, `testImpact`, `breakingChangeHints` |
| Multi-lane blast (hard + soft) | M-049 **Done** | Config/CI/script edges with confidence + evidence; tooling floors; ADR-0027 |
| Change review | M-048 **Done** | Multi-path aggregate review for SCM / editor |

### 6.4 Health, explorer, insights — Done (one deferred)

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Engineering health metrics | M-022 **Done** | Entropy, drift, debt, churn, hotspots, knowledge decay, conflict risk |
| Code Explorer queries | M-023 **Done** | Usages, ownership, related *, similar impl, git timeline |
| Engineering insights | M-024 **Deferred** | Superseded by M-046; ranked lists folded into the intelligence accuracy epic |
| Testing & security reports | M-046 **Done** | Coverage ingest, security checklist, health history backfill; ADR-0022/0023 |
| Backend route intelligence | M-044 **Done** | Express/Nest/Fastify extraction; ADR-0015 |
| Frontend bundle weight | M-050 **Done** | Consent-gated local analyze + stats ingest + treemap; ADR-0028 |

### 6.5 Core freeze & surfaces — Partly done

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Core SDK freeze v0 | M-025 **Done** | Public `@prism/core` frozen at v0.1.0; ADR-0019 |
| VS Code shell | M-030 **Done** | Extension host, webview shell, Core wiring |
| VS Code Map + Explorer | M-031 **Done** | Full human Map experience in IDE |
| Cursor extension | M-032 **Done** | Packaging/brand; coexist with MCP; ADR-0020 |
| Marketplace publishing | M-047 **Done** | `prismhq.repo-prism` on Marketplace + Open VSX; ADR-0025 |
| MCP foundation | M-026 **Next** | Stdio MCP server; thin Core adapters |
| MCP tools pack | M-027 **Next** | Full tool surface (see §7) |
| CLI foundation | M-028 **Next** | `prism` binary + Commander |
| CLI commands | M-029 **Next** | `analyze\|map\|health\|dna\|blast-radius\|safe-delete\|insights` |

### 6.6 Scale, quality, GA — Later

| Capability | Milestone(s) | Requirements summary |
|---|---|---|
| Incremental index & watch | M-033 **Deferred** | Superseded by M-048 Phase 1; ADR-0026 |
| Multi-language (Tree-sitter) | M-034 **Deferred** | Off the GA path; revisit post-GA (Q-005 open) |
| Hardening & signal integrity | M-051 **Active** | Release safety, watch/RPC correctness, provenance, one risk-band helper; ADR-0029 |
| Surface consolidation | M-052 **Next** | Lift analysis out of the UI into Core; unify the two clients — prerequisite for MCP/CLI |
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

Relocked **dark** by [ADR-0014](./adr/0014-uxpilot-dark-product-ui.md) in M-042.
The values below mirror `packages/ui/src/tokens.css`, which is the source of
truth — if they disagree, the stylesheet wins and this table is stale.

| Token | Hex | Use |
|---|---|---|
| `--prism-brand` | `#00C2C2` | Mark, CTA, selected regions, route edges |
| `--prism-brand-strong` | `#00DCD4` | Hover / emphasis |
| `--prism-on-brand` | `#FFFFFF` | Text on brand |
| `--prism-ink` | `#FFFFFF` | Primary text |
| `--prism-ink-muted` | `#94A3B8` | Captions, faint text |
| `--prism-text` | `#E6F0F2` | Body text on dark surfaces |
| `--prism-line` / `--prism-border` | `#2A334A` | Borders |
| `--prism-canvas` | `#0A0E1A` | Map / app background |
| `--prism-canvas-alt` / `--prism-panel-2` | `#0F1420` | Recessed background |
| `--prism-panel` / `--prism-surface` | `#131926` | Chrome, cards |
| `--prism-tile` / `--prism-elev` | `#1E2433` | Raised surfaces, node fill |
| `--prism-risk` / `--prism-amber` | `#F59E0B` | Impact / risk only |
| `--prism-risk-extreme` / `--prism-rose` | `#F43F5E` | Extreme risk |
| `--prism-safe` / `--prism-emerald` | `#10B981` | Healthy signals (sparingly) |
| `--prism-violet` | `#6C63FF` | Reserved secondary accent |

| Rule | Detail |
|---|---|
| Accent | One family: **teal/cyan** — no candy palette |
| Type | **Inter** (UI) · **JetBrains Mono** (paths/code) — replaced Satoshi / IBM Plex Mono in ADR-0014 |
| Shell | Left KPI sidebar · one canvas · Inspector |
| Logo | Locked faceted geometric “P” |
| Theme | **Dark-first** (ADR-0014). Light is not shipped |
| No-data | Signals that cannot be measured render neutral with an explicit “No data”, never a colour (ADR-0029) |

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
| Map UI | React + Vite + React Flow (Highcharts density prototype removed in M-019 close-out) |
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

## 12. Roadmap snapshot (2026-08-05)

`PROGRESS.md` is authoritative; this is the shape of the remaining work.

### Shipped (Verified on `main`)

Everything through **M-050**, other than the deferrals below. That includes the
whole analysis core, the map, impact analysis, engineering health, the Code
Explorer, the Core SDK freeze, and the published VS Code / Cursor extensions.

### Active

| Milestone | Focus |
|---|---|
| **M-051 Hardening & Signal Integrity** | Release safety, watch + RPC correctness, signal provenance (ADR-0029), one risk-band helper, plan reconciliation |

### Deferred / parked

| Milestone | Note |
|---|---|
| **M-024 Insights** | Superseded by M-046 |
| **M-033 Incremental Watch** | Superseded by M-048 Phase 1 (ADR-0026) |
| **M-034 Tree-sitter** | Off the GA path; delivers nothing to TS/JS users today. Revisit post-GA; Q-005 stays open |
| Treemap animation polish | Owner: revisit after feature milestones |

### Remaining path to GA

1. **M-051** hardening (active)
2. **M-052** surface consolidation — lift analysis out of the UI into Core, so
   MCP and CLI inherit it instead of reimplementing it
3. **M-026 / M-027** MCP server and tools pack
4. **M-028 / M-029** CLI foundation and commands
5. **M-035** performance · **M-036** security & privacy · **M-037** E2E suite
6. **M-038** docs site
7. **M-039** GA readiness → 1.0.0

Critical path:

```text
M-051 → M-052 → (M-026 → M-027) → (M-028 → M-029)
  → M-035 → M-036 → M-037 → M-038 → M-039 GA
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
| M-043 | UI Fine-Tuning | Map / UI |
| M-044 | Backend Intelligence | Intelligence |
| M-046 | Intelligence Accuracy | Intelligence |
| M-047 | Extension Marketplace | Surfaces |
| M-048 | Extension Polish | Surfaces |
| M-049 | Blast Radius Depth | Impact |
| M-050 | Frontend Bundle Weight | Intelligence |
| M-033 | Incremental Watch | Scale (deferred) |
| M-034 | Tree-sitter | Scale (deferred) |
| M-051 | Hardening & Signal Integrity | Hardening |
| M-052 | Surface Consolidation | Hardening |
| M-035 | Perf Hardening | Hardening |
| M-036 | Security Privacy | Hardening |
| M-037 | E2E Suite | Quality |
| M-038 | Docs Site | Docs |
| M-039 | GA Readiness | Release |

---

*End of PRD. For implementation sequencing and DoD checklists, use the Master Plan and `plans/milestones/`.*

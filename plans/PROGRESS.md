# Prism — Milestone Progress

> Update this file on every milestone merge.  
> Only **one** milestone may be `In Progress` at a time.  
> Master Plan: [`00_MASTER_DEVELOPMENT_PLAN.md`](./00_MASTER_DEVELOPMENT_PLAN.md)

| Milestone | Branch | Status | Owner approved | Merged to main | Notes |
|---|---|---|---|---|---|
| Planning baseline (this package) | — | Verified | ✅ | ☐ | Master Plan **APPROVED** 2026-07-20; brand + design system locked |
| M-000 Architecture Docs | `milestone/M-000-architecture-docs` | Verified | ✅ | ✅ | Approved 2026-07-20; architecture pack in `plans/architecture/` |
| M-001 Project Foundation | `milestone/M-001-project-foundation` | Verified | ✅ | ✅ | Approved 2026-07-20; Bun/moon/Oxlint/Lefthook foundation |
| M-002 Shared Contracts | `milestone/M-002-shared-contracts` | Verified | ✅ | ✅ | Approved 2026-07-20; Result/PrismError/IDs/Zod DTOs |
| M-003 Core Skeleton | `milestone/M-003-core-skeleton` | Verified | ✅ | ✅ | Approved 2026-07-20; Prism façade + ADR-0004 |
| M-004 Analyzer SPI | `milestone/M-004-analyzer-spi` | Verified | ✅ | ✅ | Approved 2026-07-20; LanguagePlugin SPI + ADR-0005 |
| M-005 FS Ignore Hash | `milestone/M-005-fs-ignore-hash` | Verified | ✅ | ✅ | Approved 2026-07-20; inventory + SHA-256; plan adds M-040 |
| M-040 Stack Detector SPI | `milestone/M-040-stack-detector-spi` | Verified | ✅ | ✅ | Approved 2026-07-20; SPI + Core APIs; ADR-0008 utilities backlog |
| M-006 AST Engine TS | `milestone/M-006-ast-engine-ts` | Verified | ✅ | ✅ | Approved 2026-07-20; Oxc TS/JS plugin + ADR-0009 |
| M-007 Indexer v1 | `milestone/M-007-repository-indexer` | Verified | ✅ | ✅ | Approved 2026-07-20; IndexSnapshot + IndexJob + Core index/getIndex |
| M-008 SQLite Cache | `milestone/M-008-sqlite-cache` | Verified | ✅ | ✅ | Approved 2026-07-20; SQLite cache + ADR-0010 |
| M-009 Graph Engine | `milestone/M-009-graph-engine` | Verified | ✅ | ✅ | Approved 2026-07-20; ngraph store + graph DTOs |
| M-010 Dependency Graph | `milestone/M-010-dependency-graph` | Verified | ✅ | ✅ | Approved 2026-07-20; file/package dep graph + cycles |
| M-011 Semantic KG | `milestone/M-011-semantic-kg` | Verified | ✅ | ✅ | Approved 2026-07-20; symbol KG + findReferences |
| M-012 Feature Graph | `milestone/M-012-feature-graph` | Verified | ✅ | ✅ | Approved 2026-07-20; feature heuristics + ADR-0011 |
| M-013 Repository DNA | `milestone/M-013-repository-dna` | Verified | ✅ | ✅ | Approved 2026-07-20; multi-domain DNA + personas |
| M-014 Intelligence API | `milestone/M-014-intelligence-api` | Verified | ✅ | ✅ | Approved 2026-07-20; intelligence() aggregate; unblocks M-041 |
| M-015 Health Score | `milestone/M-015-health-score` | Verified | ✅ | ✅ | Approved 2026-07-20; getHealth + ADR-0012 |
| M-016 Navigation Engine | `milestone/M-016-navigation-engine` | Verified | ✅ | ✅ | Approved 2026-07-20; findRoute / landmarks |
| M-041 Stack Utilities Epic | `milestone/M-041-stack-utilities` | Verified | ✅ | ✅ | Approved 2026-07-20; Gate A+B (P0–P7 + Mono-v1/v2 + overlays); unblocks M-017/M-018 |
| M-017 Map Data Model | `milestone/M-017-map-data-model` | Verified | ✅ | ✅ | Approved 2026-07-20; getRepositoryMap |
| M-018 Map UI Playground | `milestone/M-018-map-ui-playground` | Verified | ✅ | ✅ | Approved 2026-07-21; map playground + @prism/ui; polish/animation deferred |
| M-019 Map Layers | `milestone/M-019-map-layers` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: layer UX shipped in M-042; closed out + removed dead map prototypes (ZoomRail, OverviewTreemap, DensityMap/Highcharts) |
| M-042 UI System v2 | `milestone/M-042-ui-system-v2` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: ADR-0013 (unified scalable map + local Git signals) + ADR-0014 (UXPilot **dark** relock — dark tokens, left KPI sidebar, edge graph, blast rings on select, rebuilt inspector, new Overview/dashboard landing, Inter/JetBrains Mono) + Material Icon Theme file/folder icons |
| M-020 Blast Radius | `milestone/M-020-blast-radius` | Verified | ✅ | ✅ | Approved 2026-07-22; `@prism/impact` `computeBlastRadius` (reverse-dep traversal, depth/truncation, risk score) + Core `blastRadius()` + `impact` capability |
| M-021 Safe Delete / Rename | `milestone/M-021-safe-delete-rename` | Verified | ✅ | ✅ | Approved 2026-07-22; `safeDelete`/`renameImpact`/`testImpact`/`breakingChangeHints` in `@prism/impact` + Core, golden reports on `m011-refs` |
| M-043 UI Fine-Tuning | `milestone/M-043-ui-finetune` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: playground DNA/domains/blast/trends/integrations/settings/audit; KPI tooltips; git Recent Activity; Stitch mocks + ADR-0015/0016; M-044 plan stub |
| M-044 Backend Intelligence | `milestone/M-044-backend-intelligence` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: BackendReport + getBackendReport(); Express/Nest/Fastify extractors; playground Backend UI + MCP prism_backend_report; ADR-0015 Accepted |
| M-046 Intelligence Accuracy | `milestone/M-046-intelligence-accuracy` | Verified | ✅ | ✅ | Approved + merged 2026-07-24: `@prism/app-shell` + UI primitives; testing/security reports; health history backfill; domain deep dives (DevOps/Frontend Lighthouse auto-preview); ADRs 0021–0024; supersedes M-024 |
| M-022 Eng Health | `milestone/M-022-engineering-health` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: EngineeringHealthReport + getEngineeringHealth(); entropy/drift/debt/churn/conflict/decay + hotspots; ADR-0017 Accepted |
| M-023 Code Explorer | `milestone/M-023-code-explorer` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: CodeExplorerReport + exploreCode(); usages/ownership/related/similar/timeline; ADR-0018 Accepted |
| M-024 Insights | `milestone/M-024-engineering-insights` | Deferred | ☐ | ☐ | Superseded by M-046 (Most Connected / insights folded into intelligence accuracy epic) |
| M-025 Core SDK Freeze v0 | `milestone/M-025-core-sdk-freeze` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: v0.1.0 freeze, ADR-0019, CORE_SDK guide, contract tests, map/navigation caps |
| M-026 MCP Server | `milestone/M-026-mcp-server` | Not Started | ☐ | ☐ | |
| M-027 MCP Tools Pack | `milestone/M-027-mcp-tools-pack` | Not Started | ☐ | ☐ | |
| M-028 CLI Foundation | `milestone/M-028-cli-foundation` | Not Started | ☐ | ☐ | |
| M-029 CLI Commands | `milestone/M-029-cli-commands` | Not Started | ☐ | ☐ | |
| M-030 VS Code Shell | `milestone/M-030-vscode-shell` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: Extension Host shell, PrismSession, Map webview (`RepositoryMapView`), Reindex/Open Map, Electron better-sqlite3 staging |
| M-031 VS Code Features | `milestone/M-031-vscode-features` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: full playground UI in extension webview (Overview/Map/DNA/Domains/Blast/Trends/Settings) via Core postMessage; Open Prism / Show Health commands |
| M-032 Cursor Extension | `milestone/M-032-cursor-extension` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: Cursor packaging overlay (ADR-0020); Open in browser via loopback Core bridge |
| M-047 Extension Marketplace | `milestone/M-047-extension-marketplace` | Verified | ✅ | ✅ | Approved + merged 2026-07-26: staged VSIX (ADR-0025), `prismhq.repo-prism` on Marketplace + Open VSX, publish CI, README install links |
| M-048 Extension Polish | `milestone/M-048-extension-polish` | Verified | ✅ | ✅ | Merged 2026-07-28: watch + editor hooks + review/explain + tour + polish; Phase 8 blast depth deferred to M-049 |
| M-049 Blast Radius Depth | `milestone/M-049-blast-radius-depth` | Verified | ✅ | ✅ | Merged 2026-07-30: multi-lane soft+hard blast, barrel resolution, findings UI, roles, edit/delete, soft cache |
| M-033 Incremental Watch | `milestone/M-033-incremental-watch` | Deferred | ☐ | ☐ | Superseded by M-048 Phase 1 (ADR-0026) |
| M-034 Tree-sitter | `milestone/M-034-tree-sitter` | Not Started | ☐ | ☐ | |
| M-035 Perf Hardening | `milestone/M-035-perf-hardening` | Not Started | ☐ | ☐ | |
| M-036 Security Privacy | `milestone/M-036-security-privacy` | Not Started | ☐ | ☐ | |
| M-037 E2E Suite | `milestone/M-037-e2e-suite` | Not Started | ☐ | ☐ | |
| M-038 Docs Site | `milestone/M-038-docs-site` | Not Started | ☐ | ☐ | |
| M-039 GA Readiness | `milestone/M-039-ga-readiness` | Not Started | ☐ | ☐ | |

## Legend

`Not Started` · `In Progress` · `In Review` · `Blocked` · `Verified` · `Deferred`

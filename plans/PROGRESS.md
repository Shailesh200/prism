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
| M-018 Map UI Playground | `milestone/M-018-map-ui-playground` | Verified | ✅ | ✅ | Approved 2026-07-21; map playground + @repo-prism/ui; polish/animation deferred |
| M-019 Map Layers | `milestone/M-019-map-layers` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: layer UX shipped in M-042; closed out + removed dead map prototypes (ZoomRail, OverviewTreemap, DensityMap/Highcharts) |
| M-042 UI System v2 | `milestone/M-042-ui-system-v2` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: ADR-0013 (unified scalable map + local Git signals) + ADR-0014 (UXPilot **dark** relock — dark tokens, left KPI sidebar, edge graph, blast rings on select, rebuilt inspector, new Overview/dashboard landing, Inter/JetBrains Mono) + Material Icon Theme file/folder icons |
| M-020 Blast Radius | `milestone/M-020-blast-radius` | Verified | ✅ | ✅ | Approved 2026-07-22; `@repo-prism/impact` `computeBlastRadius` (reverse-dep traversal, depth/truncation, risk score) + Core `blastRadius()` + `impact` capability |
| M-021 Safe Delete / Rename | `milestone/M-021-safe-delete-rename` | Verified | ✅ | ✅ | Approved 2026-07-22; `safeDelete`/`renameImpact`/`testImpact`/`breakingChangeHints` in `@repo-prism/impact` + Core, golden reports on `m011-refs` |
| M-043 UI Fine-Tuning | `milestone/M-043-ui-finetune` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: playground DNA/domains/blast/trends/integrations/settings/audit; KPI tooltips; git Recent Activity; Stitch mocks + ADR-0015/0016; M-044 plan stub |
| M-044 Backend Intelligence | `milestone/M-044-backend-intelligence` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: BackendReport + getBackendReport(); Express/Nest/Fastify extractors; playground Backend UI + MCP prism_backend_report; ADR-0015 Accepted |
| M-046 Intelligence Accuracy | `milestone/M-046-intelligence-accuracy` | Verified | ✅ | ✅ | Approved + merged 2026-07-24: `@repo-prism/app-shell` + UI primitives; testing/security reports; health history backfill; domain deep dives (DevOps/Frontend Lighthouse auto-preview); ADRs 0021–0024; supersedes M-024 |
| M-022 Eng Health | `milestone/M-022-engineering-health` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: EngineeringHealthReport + getEngineeringHealth(); entropy/drift/debt/churn/conflict/decay + hotspots; ADR-0017 Accepted |
| M-023 Code Explorer | `milestone/M-023-code-explorer` | Verified | ✅ | ✅ | Approved + merged 2026-07-22: CodeExplorerReport + exploreCode(); usages/ownership/related/similar/timeline; ADR-0018 Accepted |
| M-024 Insights | `milestone/M-024-engineering-insights` | Deferred | ☐ | ☐ | Superseded by M-046 (Most Connected / insights folded into intelligence accuracy epic) |
| M-025 Core SDK Freeze v0 | `milestone/M-025-core-sdk-freeze` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: v0.1.0 freeze, ADR-0019, CORE_SDK guide, contract tests, map/navigation caps |
| M-027 MCP Tools Pack | `milestone/M-027-mcp-tools-pack` | Verified | ✅ | ✅ | 2026-08-05. 28 tools across orientation/graphs/impact/reports; `limit` envelope with `totalCount`+`truncated`; workspace-relative path guard; tools renamed to unprefixed snake_case. `architecture_rules` removed from Master Plan + PRD. **Owner verified 2026-08-08** (merged on main) |
| M-028 CLI Foundation | `milestone/M-028-cli-foundation` | Verified | ✅ | ✅ | 2026-08-05. `prism` binary: Commander spine, git-root workspace discovery, human/`--json` rendering, 4-way exit codes, `doctor`/`index`/`dna`. 16 integration tests spawn the real binary. **Owner verified 2026-08-08** (merged on main) |
| M-029 CLI Commands | `milestone/M-029-cli-commands` | Verified | ✅ | ✅ | 2026-08-05. 26 commands from one declarative registry; `--fail-on`/`--limit` everywhere, 80-column wrapping, shared `riskToBand` colouring. Core `getChangedPaths` for `prism review`. 77 integration tests. Completions deferred. **Owner verified 2026-08-08** (merged on main) |
| M-030 VS Code Shell | `milestone/M-030-vscode-shell` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: Extension Host shell, PrismSession, Map webview (`RepositoryMapView`), Reindex/Open Map, Electron better-sqlite3 staging |
| M-031 VS Code Features | `milestone/M-031-vscode-features` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: full playground UI in extension webview (Overview/Map/DNA/Domains/Blast/Trends/Settings) via Core postMessage; Open Prism / Show Health commands |
| M-032 Cursor Extension | `milestone/M-032-cursor-extension` | Verified | ✅ | ✅ | Approved + merged 2026-07-23: Cursor packaging overlay (ADR-0020); Open in browser via loopback Core bridge |
| M-047 Extension Marketplace | `milestone/M-047-extension-marketplace` | Verified | ✅ | ✅ | Approved + merged 2026-07-26: staged VSIX (ADR-0025), `prismhq.repo-prism` on Marketplace + Open VSX, publish CI, README install links |
| M-048 Extension Polish | `milestone/M-048-extension-polish` | Verified | ✅ | ✅ | Merged 2026-07-28: watch + editor hooks + review/explain + tour + polish; Phase 8 blast depth deferred to M-049 |
| M-049 Blast Radius Depth | `milestone/M-049-blast-radius-depth` | Verified | ✅ | ✅ | Merged 2026-07-30: multi-lane soft+hard blast, barrel resolution, findings UI, roles, edit/delete, soft cache |
| M-050 Frontend Bundle Weight | `milestone/M-050-bundle-weight` | Verified | ✅ | ✅ | Merged 2026-08-05: FE-06 detect analyze scripts, consent-gated local Analyze, bundle-stats ingest, Frontend Domain Bundle/Weight treemap (ADR-0028); owner waived manual smoke |
| M-051 Hardening & Signal Integrity | `milestone/M-051-hardening` | Verified | ✅ | ✅ | 2026-08-05. All five phases; verify green with cache bypassed. ADR-0029 signal provenance; release safety, watch/RPC correctness, risk bands, plan reconciliation. **Owner verified 2026-08-08** (merged on main) |
| M-052 Surface Consolidation | `milestone/M-052-surface-consolidation` | Verified | ✅ | ✅ | 2026-08-05. Analysis lift only (§3a): `getOverviewModel`, `runWorkspaceTests`/`listWorkspaceTests`, ~450 duplicated lines deleted from `host-dispatch`. Presentation work → M-053. **Owner verified 2026-08-08** (merged on main) |
| M-026 MCP Server Foundation | `milestone/M-026-mcp-server` | Verified | ✅ | ✅ | 2026-08-05. stdio MCP server over Core: lazy workspace + index-once lifecycle, 5 read-only tools, `PrismError`→JSON-RPC mapping, ADR-0030. Consent-gated Core paths deliberately unreachable. E2E against this repo (755 files). **Owner verified 2026-08-08** (merged on main) |
| M-053 Presentation Consolidation | `milestone/M-053-presentation-consolidation` | Verified | ☑ | ☑ | Carries M-052's presentation half: `getDomainReport`, CWV convergence, `PrismClient` unification, screen de-duplication, a11y. Also shipped: production-only lab, scoped route discovery, form factor, unreliable-run guard |
| M-033 Incremental Watch | `milestone/M-033-incremental-watch` | Deferred | ☐ | ☐ | Superseded by M-048 Phase 1 (ADR-0026) |
| M-034 Tree-sitter | `milestone/M-034-tree-sitter` | Deferred | ☐ | ☐ | Deferred by owner 2026-08-05: blocks nothing, not on the GA path, and delivers nothing to TS/JS users. Revisit with the post-GA idea backlog; Q-005 remains open |
| M-035 Perf Hardening | `milestone/M-035-perf-hardening` | Verified | ✅ | ✅ | 2026-08-05. Fixture generator, benchmark harness, baseline in `architecture/08_PERFORMANCE.md`, budgets in CI. Map 31.7s→1.0s at 10k; 66.9s→4.2s at 50k; incremental reindex 4.2s→1.9s. **Owner verified 2026-08-08** (merged on main) |
| M-036 Security Privacy | `milestone/M-036-security-privacy` | Verified | ✅ | ✅ | 2026-08-05. Consent in Core (six purposes); `consentGranted` removed from APIs; Gravatar local-by-default; no-network suite; SECURITY/PRIVACY/CONTRIBUTING + threat model. **Owner verified 2026-08-08** (merged on main) |
| M-037 E2E Suite | `milestone/M-037-e2e-suite` | Verified | ✅ | ✅ | 2026-08-05. `@repo-prism/test-support`; Core integration for 18 methods; cross-surface Core/MCP/CLI; Playwright smoke; six real bugs fixed. Windows advisory (§6a). **Owner verified 2026-08-08** (merged on main) |
| M-038 Docs Site | `milestone/M-038-docs-site` | Verified | ✅ | ✅ | 2026-08-05. `/docs` Markdown + VitePress; CLI/MCP reference generated from source; `check-docs.mjs` fidelity gate. **Owner verified 2026-08-08** (merged on main) |
| M-039 GA Readiness | `milestone/M-039-ga-readiness` | Verified | ✅ | ✅ | 2026-08-05. 1.0.0 across extension/Core/CLI/MCP; CHANGELOG + release runbook; ADRs Accepted; open questions dispositioned; first-run audit fixes. Tag `repo-prism-v1.0.0` local (push separate). **Owner verified 2026-08-08** (merged on main) |
| M-054 Public Website | `milestone/M-054-website` | Verified | ✅ | ✅ | Merged 2026-08-06. Next.js 16 + Fumadocs at `apps/website` (ADR-0031); docs rewritten into CLI/IDE/MCP lanes + task guides; `/admin` from public APIs; VitePress retired. Owner: finish Vercel import + domain per `apps/website/OWNER_HANDOFF.md` |
| M-055 Website Marketing Motion | `milestone/M-055-website-motion` | Verified | ✅ | ✅ | Approved + merged 2026-08-08. GSAP cartographic motion on marketing pages (ADR-0032); portfolio mechanism without gate/wipe/HUD/particles; prompt at `plans/prompts/WEBSITE_GSAP_REDESIGN.md`. Owner smoked locally. |
| M-056 Number Integrity | `milestone/M-056-number-integrity` | Verified | ☑ | ☑ | Truncation honesty: unresolved imports, git cap, blast limits, polyglot coverage, coverage limitations. Fast-tracked: scope landed via M-053 merge, audit confirmed |
| M-057 Daily Loop | `milestone/M-057-daily-loop` | In Progress | ☐ | ☐ | IDE hero: watcher, blast Quick Pick, shared config, completions, Node ≥22 |
| M-058 Agent Surface v2 | `milestone/M-058-agent-surface` | Planned | ☐ | ☐ | MCP hero: bounded tools, resources, capabilities, compact JSON |
| M-059 Reference Precision | `milestone/M-059-reference-precision` | Planned | ☐ | ☐ | Moat: homonyms, member calls, barrels, tsconfig, require(); deep-TS spike |
| M-060 CI and PR Integration | `milestone/M-060-ci-pr` | Planned | ☐ | ☐ | GitHub Action, SARIF, PR comment, cold-start caching |
| M-061 Detection Quality | `milestone/M-061-detection-quality` | Planned | ☐ | ☐ | Multi-signal detectors, feature inference fallback, backend extractors |
| M-062 UI Actionability | `milestone/M-062-ui-actionability` | Planned | ☐ | ☐ | D-9 IA merge, DomainScreen split, dead-end fixes, shared table primitives |
| M-063 Distribution and Proof | `milestone/M-063-distribution` | Planned | ☐ | ☐ | Benchmarks, one-click MCP install, URL updates, killer demo, CHANGELOG |

## Legend

`Not Started` · `Planned` · `In Progress` · `In Review` · `Blocked` · `Verified` · `Deferred`

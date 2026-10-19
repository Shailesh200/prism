# Milestone Documents

Critical-path milestones have full specs here. Summaries for other milestones live in the Master Plan §15.

Verified milestone docs M-000 → M-079 moved to [`../archive/milestones/`](../archive/milestones/); the links below point there. On 17 Oct 2026, the obsolete and absorbed docs (M-058 → M-063, M-078, M-081, M-082, M-084 → M-086, M-094, PROGRAM/IMPLEMENTATION_prism-2.0) moved there too. Live status: [`../PROGRESS.md`](../PROGRESS.md). New milestones start from [`TEMPLATE.md`](./TEMPLATE.md).

| ID | File |
|---|---|
| M-000 | [M-000_architecture-documentation.md](../archive/milestones/M-000_architecture-documentation.md) — **docs before code** |
| M-001 | [M-001_project-foundation.md](../archive/milestones/M-001_project-foundation.md) |
| M-002 | [M-002_shared-contracts.md](../archive/milestones/M-002_shared-contracts.md) |
| M-003 | [M-003_core-skeleton.md](../archive/milestones/M-003_core-skeleton.md) |
| M-004 | [M-004_analyzer-spi.md](../archive/milestones/M-004_analyzer-spi.md) |
| M-005 | [M-005_fs-ignore-hash.md](../archive/milestones/M-005_fs-ignore-hash.md) |
| M-006 | [M-006_ast-engine-ts.md](../archive/milestones/M-006_ast-engine-ts.md) |
| M-007 | [M-007_repository-indexer.md](../archive/milestones/M-007_repository-indexer.md) |
| M-008 | [M-008_sqlite-cache.md](../archive/milestones/M-008_sqlite-cache.md) |
| M-009 | [M-009_graph-engine.md](../archive/milestones/M-009_graph-engine.md) |
| M-010 | [M-010_dependency-graph.md](../archive/milestones/M-010_dependency-graph.md) |
| M-011 | [M-011_semantic-knowledge-graph.md](../archive/milestones/M-011_semantic-knowledge-graph.md) |
| M-012 | [M-012_feature-graph.md](../archive/milestones/M-012_feature-graph.md) |
| M-013 | [M-013_repository-dna.md](../archive/milestones/M-013_repository-dna.md) |
| M-014 | [M-014_intelligence-api.md](../archive/milestones/M-014_intelligence-api.md) |
| M-016 | [M-016_navigation-engine.md](../archive/milestones/M-016_navigation-engine.md) |
| M-017 | [M-017_map-data-model.md](../archive/milestones/M-017_map-data-model.md) |
| M-018 | [M-018_map-ui-playground.md](../archive/milestones/M-018_map-ui-playground.md) |
| M-020 | [M-020_blast-radius.md](../archive/milestones/M-020_blast-radius.md) |
| M-025 | [M-025_core-sdk-freeze.md](../archive/milestones/M-025_core-sdk-freeze.md) |
| M-026 | [M-026_mcp-server.md](../archive/milestones/M-026_mcp-server.md) |
| M-028 | [M-028_cli-foundation.md](../archive/milestones/M-028_cli-foundation.md) |
| M-030 | [M-030_vscode-extension-shell.md](../archive/milestones/M-030_vscode-extension-shell.md) |
| M-039 | [M-039_ga-readiness.md](../archive/milestones/M-039_ga-readiness.md) |
| M-048 | [M-048_extension-polish.md](../archive/milestones/M-048_extension-polish.md) — includes Phase 8 Blast Radius Depth |
| M-049 | [M-049_blast-radius-depth.md](../archive/milestones/M-049_blast-radius-depth.md) — **Absorbed** into M-048 Phase 8 (design archive) |
| M-064 | [M-064_agent-dashboard.md](../archive/milestones/M-064_agent-dashboard.md) — jobs hub daemon, OS/IDE toasts, MCP App widget |
| M-067 | [M-067_shippable-product.md](../archive/milestones/M-067_shippable-product.md) — queue + honest clock, Console, host-delegated integrations, plugin pack |
| M-068 | [M-068_trinity-console.md](../archive/milestones/M-068_trinity-console.md) — Trinity-grade Console (design lock: [`CONSOLE_FLEET.md`](../mockups/CONSOLE_FLEET.md)) |
| M-069 | [M-069_agent-substrate.md](../archive/milestones/M-069_agent-substrate.md) — Envelope pipe, Honest Edges, verify-plan, Console Iris without Spectrum |
| M-070 | [M-070_prepare-change.md](../archive/milestones/M-070_prepare-change.md) — pack + reuse + House Style in one `prepare_change` |
| M-071 | [M-071_finding-loop.md](../archive/milestones/M-071_finding-loop.md) — `queue_finding` + fingerprinted re-scan loop |
| M-072 | [M-072_prism-guard.md](../archive/milestones/M-072_prism-guard.md) — `guard_session` + VS Code/Cursor panel |
| M-073 | [M-073_agents-md-working-set.md](../archive/milestones/M-073_agents-md-working-set.md) — Living AGENTS.md (`~/.prism` only) + Working Set on `JobRecord` |
| M-080 | [M-080_agent-cli-ia.md](./M-080_agent-cli-ia.md) — HTTP `/mcp`. **Deferred** |
| M-083 | [M-083_engine-merge.md](./M-083_engine-merge.md) — engine package merge. **Deferred** until after 2.0 |
| Program | [PROGRAM_focus-reset.md](./PROGRAM_focus-reset.md) — Focus Reset (M-087 → M-100). Approved 2026-10-10; partly superseded (Envelope removed, 2.0 unified plan) |
| M-087 | [M-087_focus-reset-plan.md](./M-087_focus-reset-plan.md) — the plan; umbrella branch, **In Progress** |
| M-088 | [M-088_identity-hero-copy.md](./M-088_identity-hero-copy.md) — Prism stays; hero copy. **Partly done** (README behind) |
| M-089 | [M-089_one-build-everywhere.md](./M-089_one-build-everywhere.md) — workspace build on every host. **Built, not verified** |
| M-090 | [M-090_hygiene.md](./M-090_hygiene.md) — branches, stashes, worktrees, data prune, plans archive. **Done** |
| M-091 | [M-091_surface-cut.md](./M-091_surface-cut.md) — 9 default tools (2.0), Dispatch off MCP. **Done** |
| M-092 | [M-092_receipt-v2.md](./M-092_receipt-v2.md) — baseline-aware, session-scoped receipt. **Built, not verified** |
| M-093 | [M-093_prepare-v2.md](./M-093_prepare-v2.md) — budget, replay eval, auto-Prepare. **Built, not verified** |
| M-094 | [M-094_envelope-v2.md](../archive/milestones/M-094_envelope-v2.md) — **Obsolete**: Envelope removed 17 Oct 2026 |
| M-095 | [M-095_graph-daemon.md](./M-095_graph-daemon.md) — always-fresh local daemon. **Built, not verified** |
| M-096 | [M-096_graph-artifact-tool.md](./M-096_graph-artifact-tool.md) — `graph` tool + `graph.json` export (`graph.html` deleted in 2.0). **Done** |
| M-097 | [M-097_first-run.md](./M-097_first-run.md) — first run, re-scoped to `prism start`. **Built, not verified** |
| M-098 | [M-098_real-agent-proof.md](./M-098_real-agent-proof.md) — Claude Code + opencode A/B. **Open (round 4)** |
| M-099 | [M-099_delete-dispatch.md](./M-099_delete-dispatch.md) — delete Dispatch + dead UI. **Done** (`f45ccb7`) |
| M-100 | [M-100_relaunch.md](./M-100_relaunch.md) — README, docs, website. **Built, not deployed** |
| M-074 | [M-074_bloat-job-cost.md](../archive/milestones/M-074_bloat-job-cost.md) — `duplicate_implementation` + `wrapper_over_existing` findings, mute list, `list_findings`, Pulse token-cost chart |
| M-075 | [M-075_symbol-memory-adr.md](../archive/milestones/M-075_symbol-memory-adr.md) — symbol-anchored `remember`, ADR/`WHY:` `rationale_for` edges, `prepare_change.notes` |
| PROGRAM | [PROGRAM_agent-native-iris.md](./PROGRAM_agent-native-iris.md) — Cuts 1–3 done (M-069 → M-076); Cut 4 set aside. First engineering milestone: [M-069](../archive/milestones/M-069_agent-substrate.md). |
| 3 prompts | [PROGRAM_agent-native-3-PHASES.md](./PROGRAM_agent-native-3-PHASES.md) — all three phases done 2026-09-17. |

# ADR Index

One row per Architecture Decision Record. Status is the one written in the ADR header. "Superseded by" names the later ADR that replaces it, in whole or in the part shown. New ADRs start from [the template](./0000-adr-template.md); add a row here when you add one.

| Number | Title | Status | Superseded by |
|---|---|---|---|
| 0001 | [Product name is Prism](./0001-product-name-prism.md) | Accepted | — |
| 0002 | [Bun package manager, Node 26, lint/format toolchain](./0002-toolchain-bun-node-lint.md) | Superseded in part | [ADR-0003](./0003-locked-performance-stack.md) (lint, monorepo, parser) |
| 0003 | [Locked performance-oriented toolchain](./0003-locked-performance-stack.md) | Locked | — |
| 0004 | [Core is the only supported integration surface](./0004-core-only-integration-surface.md) | Accepted | — |
| 0005 | [Analyzer plugin isolation & SPI versioning](./0005-analyzer-plugin-isolation.md) | Accepted | — |
| 0006 | [Content hashing with SHA-256](./0006-content-hash-sha256.md) | Accepted | — |
| 0007 | [Pluggable stack + developer-persona detection](./0007-stack-detector-spi.md) | Accepted | — |
| 0008 | [Stack-aware measurement utilities (owner decisions 2026-07-20)](./0008-stack-aware-measurement-utilities.md) | Accepted (amended) | — |
| 0009 | [Oxc parser for v1; deep TypeScript optional later](./0009-oxc-parser-v1-deep-ts-optional.md) | Accepted | — |
| 0010 | [Local SQLite cache location and privacy](./0010-sqlite-cache-location.md) | Accepted | — |
| 0011 | [Feature inference principles (v1)](./0011-feature-inference-principles.md) | Accepted | — |
| 0012 | [Repository health score weighting (v1)](./0012-health-score-weighting.md) | Accepted | — |
| 0013 | [Unified scalable map + local Git signals](./0013-unified-map-and-git-signals.md) | Accepted | — |
| 0014 | [UXPilot dark product UI (relock)](./0014-uxpilot-dark-product-ui.md) | Accepted | — |
| 0015 | [Backend Intelligence — route-level API surface & domain heuristics](./0015-backend-intelligence-overlays.md) | Accepted | — |
| 0016 | [DevOps · Platform — CI/CD pipeline detection & Integrations roadmap](./0016-devops-ci-pipeline-detection.md) | Accepted | — |
| 0017 | [Engineering health report (complementary to HealthScore)](./0017-engineering-health-report.md) | Accepted | — |
| 0018 | [Code Explorer report (selection-scoped Core query)](./0018-code-explorer-report.md) | Accepted | — |
| 0019 | [Core SDK versioning & deprecation (v0 freeze)](./0019-core-sdk-versioning.md) | Accepted | — |
| 0020 | [Cursor packaging overlay (single extension product)](./0020-cursor-packaging-overlay.md) | Accepted | — |
| 0021 | [App-shell consolidation (playground + IDE webviews)](./0021-app-shell-consolidation.md) | Accepted | — |
| 0022 | [Testing and Security reports (Core + product surface)](./0022-testing-security-reports.md) | Accepted | — |
| 0023 | [Trends history store and git commit backfill](./0023-trends-history-backfill.md) | Accepted | — |
| 0024 | [Opt-in network integrations gate](./0024-opt-in-network-integrations.md) | Accepted | — |
| 0025 | [Marketplace packaging (staged VSIX)](./0025-marketplace-packaging.md) | Accepted | — |
| 0026 | [Incremental watch invalidation unit](./0026-incremental-watch-invalidation.md) | Accepted | — |
| 0027 | [Blast Radius Multi-Lane Signals (Hard + Soft)](./0027-blast-radius-multi-lane-signals.md) | Accepted | — |
| 0028 | [Frontend Bundle Weight ingest + local analyze runner](./0028-frontend-bundle-weight-ingest.md) | Accepted | — |
| 0029 | [Signal Provenance (measured / heuristic / estimated / unavailable)](./0029-signal-provenance.md) | Accepted | — |
| 0030 | [MCP transport, workspace lifecycle and consent refusal](./0030-mcp-transport-and-lifecycle.md) | Accepted | — |
| 0031 | [Next.js + Fumadocs public website (replace VitePress)](./0031-nextjs-fumadocs-website.md) | Accepted | — |
| 0032 | [GSAP for Prism marketing-site motion](./0032-website-gsap-motion.md) | Accepted | — |
| 0033 | [GitHub CI + PageSpeed network via Core consent gate](./0033-github-ci-pagespeed-via-core.md) | Accepted | — |
| 0034 | [Deep TypeScript analysis — spike result (reject for now)](./0034-deep-typescript-spike.md) | Rejected | — |
| 0035 | [Dispatch vertical on the Prism MCP server](./0035-dispatch-vertical.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts), [ADR-0064](./0064-dispatch-removed.md) (Dispatch parts) |
| 0036 | [Prism Auth broker for Dispatch OAuth](./0036-dispatch-auth-broker.md) | Superseded | [ADR-0049](./0049-host-delegated-integrations.md); also [ADR-0058](./0058-prism-does-not-run-agents.md) |
| 0037 | [Native host connect UX for Dispatch](./0037-dispatch-connect-ux.md) | Superseded | [ADR-0049](./0049-host-delegated-integrations.md) |
| 0038 | [Cursor worker credentials via SDK login, not mcp.json](./0038-cursor-worker-sdk-login.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0039 | [Canonical job ids and chat voice](./0039-dispatch-chat-voice.md) | Accepted | [ADR-0064](./0064-dispatch-removed.md) (Dispatch parts) |
| 0040 | [Dispatch worker supervisor (process isolation + live status)](./0040-dispatch-worker-supervisor.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0041 | [Dispatch worker resource budget](./0041-dispatch-worker-resource-budget.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0042 | [Dispatch durable handoff, worker verification, and subagents](./0042-dispatch-durable-handoff-and-subagents.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0043 | [Agent Dashboard Hub](./0043-agent-dashboard-hub.md) | Accepted | [ADR-0048](./0048-prism-console-unification.md) (two-port split only) |
| 0044 | [Dispatch worker backends (host-matched agent CLI)](./0044-dispatch-worker-backends.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0045 | [Job placement — checkout-first, commit on ask](./0045-job-placement-checkout-first.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0046 | [`claude --bg` as a Dispatch worker backend — rejected](./0046-claude-bg-worker-backend.md) | Accepted (decision: reject) | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0047 | [Job queue, honest timestamps, and a dispatch latency budget](./0047-job-queue-and-latency-budget.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0048 | [One Prism Console daemon, two planes](./0048-prism-console-unification.md) | Accepted | — |
| 0049 | [Delegate connectors to the host agent](./0049-host-delegated-integrations.md) | Accepted | — |
| 0050 | [Prism Plugin Pack, and worker access to intelligence](./0050-prism-plugin-pack.md) | Accepted | — |
| 0051 | [One motion vocabulary, two motion engines](./0051-motion-system.md) | Accepted | — |
| 0052 | [Iris names the aperture, not a persona](./0052-product-identity-and-iris.md) | Accepted | — |
| 0053 | [A repository is the unit; the Console must be able to start work](./0053-console-information-architecture.md) | Accepted | — |
| 0054 | [Global job store](./0054-global-job-store.md) | Accepted | [ADR-0058](./0058-prism-does-not-run-agents.md) (job-runner parts) |
| 0055 | [Guard session boundary](./0055-guard-session-boundary.md) | Accepted | — |
| 0056 | [Work-order write veto is opt-in](./0056-work-order-hook-advisory.md) | Proposed | — |
| 0057 | [Prism Intelligence is one product, one Dashboard, fewer packages](./0057-prism-intelligence-unified-product.md) | Accepted | [ADR-0060](./0060-prism-keeps-its-name.md) (identity and copy), [ADR-0064](./0064-dispatch-removed.md) (Dispatch parts) |
| 0058 | [Prism does not run agents — it is the safety layer agents run through](./0058-prism-does-not-run-agents.md) | Accepted | — |
| 0059 | [Lenses — user-owned review lenses, thought by the host's model](./0059-lenses.md) | Accepted | — |
| 0060 | [Prism keeps its name; the hero is developer speed](./0060-prism-keeps-its-name.md) | Accepted | — |
| 0061 | [Developing Prism uses the workspace build on every host](./0061-workspace-build-everywhere.md) | Accepted | — |
| 0062 | [Prism Graph replaces the Repository Map](./0062-prism-graph-replaces-repository-map.md) | Accepted | — |
| 0063 | [The Prism daemon is a process, not an agent](./0063-prism-daemon-is-a-process.md) | Accepted | — |
| 0064 | [Dispatch is removed from the product, the MCP surface and the code](./0064-dispatch-removed.md) | Accepted | — |
| 0065 | [Prepare is injected on prompt submit](./0065-auto-prepare.md) | Accepted | — |
| 0066 | [Envelope is a product surface](./0066-envelope-product-surface.md) | Accepted | — |
| 0067 | [Prism 2.0 reliability and precision decisions](./0067-prism-2-reliability-and-precision.md) | Accepted | — |

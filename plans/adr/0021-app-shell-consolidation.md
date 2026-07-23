# ADR-0021: App-shell consolidation (playground + IDE webviews)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Decision makers | Owner |
| Related milestones | M-046, M-031, M-032 |
| Related | ADR-0004 (Core-only surface), ADR-0014 (product UI) |

## Context

Dashboard screens (Overview, DNA, Domains, Trends, Blast, Settings,
Integrations, sidebar, audit) are duplicated between
`apps/playground/src` and `packages/vscode-extension/src/webview/ui`. M-031
shipped by adapting copies; a shared `@prism/app-shell` was deferred. M-046
touches most of those screens for accuracy and depth — editing twice would
diverge and double maintenance.

Surfaces must still call **`@prism/core` only** for analysis (ADR-0004). The
shell is presentation + host client injection, not a second intelligence layer.

## Decision

Introduce **`@prism/app-shell`** as the single source of Prism dashboard screens
and chrome. Playground and VS Code webview (and thus the Cursor packaging
overlay) import from that package and inject an `AppShellClient` (unified
host/map client) that talks to Core.

`@prism/ui` owns design-system primitives and tokens; app-shell composes them
into product screens. Duplicated screen trees are deleted after cutover.

## Options Considered

### Option A — Keep dual copies; sync by hand

- Pros: no new package; no import-graph churn.
- Cons: every M-046 fix lands twice; drift is inevitable.

### Option B — Shared package for screens only (recommended)

- Pros: one UI source; playground and IDE stay in lockstep; Core boundary intact.
- Cons: new workspace package + client interface to maintain.

### Option C — Playground as the only UI; IDE iframes / embeds it

- Pros: extreme consolidation.
- Cons: Extension Host constraints, offline/local packaging, and Core session
  wiring become awkward; rejected for IDE product path.

## Consequences

- Positive: one place to fix Overview/DNA/Trends/Blast/Settings/Integrations
- Positive: Cursor overlay inherits VS Code webview build without a third copy
- Negative: package boundary and `AppShellClient` contract must stay stable
- Follow-up: Repository Map feature audit remains owner-led; map light-theme
  fix may touch map CSS without moving map ownership into app-shell prematurely

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-046)

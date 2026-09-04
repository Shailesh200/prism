---
title: The packages
description: "Every package in the monorepo: role, allowed dependents, and hard rules."
---


**Every package in the monorepo: what it does, what may depend on it, and what
it must never do.**

The layering is the important part. Read [how Prism is built](./overview.md)
first if you have not.

## Contracts

### `@repo-prism/shared`

Types, DTOs, Zod schemas, error codes, and the small pure functions every layer
must agree on — `riskToBand` above all, which is why the CLI and the editor
cannot disagree about what "High" means.

Depended on by everything. Depends on nothing in the repository.

**Must never** do I/O, or use a Node-only API. It runs unchanged inside a
browser webview, and that constraint is what keeps a single definition of a
shared value available to both sides.

## Engine internals

Nothing outside this section may be imported by a surface.

### `@repo-prism/analyzer`

The language plugin interface and the host that runs plugins. Parses source into
symbols, imports and diagnostics — Oxc for TypeScript and JavaScript.

**Must never** reach outside the workspace, or execute the code it parses.

### `@repo-prism/indexer`

Walks the repository, hashes file contents, and persists the result to SQLite in
`.prism/cache/`. Owns incremental invalidation and watch mode, plus the health
history table.

**Must never** re-parse what has not changed. The hash is the whole point.

### `@repo-prism/graph-engine`

A typed graph store and the query primitives over it: traversal, reachability,
cycle detection, aggregation to a coarser level.

Deliberately ignorant of what the nodes mean, so that the dependency graph, the
knowledge graph and the feature graph share one implementation.

### `@repo-prism/intelligence`

The largest internal package, and the one that turns structure into judgement:
stack detection, repository DNA, health scoring, engineering, testing and
security reports, backend and frontend analysis, feature inference, the consent
store, and the utility job runner.

**Must never** make a network call without a consent purpose gating it.

### `@repo-prism/impact`

Blast radius, safe delete, rename impact and test impact — the multi-lane
signals described in the decision record on blast radius.

### `@repo-prism/navigation`

Feature and symbol navigation: find a symbol, find its references, find a route
between two things.

### `@repo-prism/repository-map`

The map model — clusters, landmarks, layers, and the aggregation between zoom
levels.

## The public API

### `@repo-prism/core`

The only supported integration surface. `PrismWorkspace` is the whole thing:
open a repository, ask questions, get `Result<T, PrismError>` back.

Also the place consent is enforced, so no caller can route around it.

**Must never** be bypassed by a surface, and must never grow a method that
returns an engine-internal type. See [the Core SDK](./core-sdk.md).

## Presentation

### `@repo-prism/app-shell`

Every product screen — Overview, Map, Domains, Impact, Trends, Integrations,
Settings — as React components, plus the `AppShellClient` interface a host
implements to serve them data.

Shared by the extension webview and the playground, which is why a screen change
lands in both at once.

**Must never** import Node APIs. It runs in a browser.

### `@repo-prism/ui`

Lower-level shared React components: the map canvas, the explorer, and the
primitives the screens are built from.

### `@repo-prism/host-session`

The Core-backed request surface two hosts both need: the `HostRequest` /
`HostResponse` protocol, its runtime guards, the `PrismSession` wrapper around
Core, and the dispatcher that turns one into the other.

Extracted from the IDE extension so the Prism Console can answer the same RPC
(ADR-0048) instead of the extension running a second, tokenless server on
`:17321`. The filesystem-rename fallback lives here; the extension injects its
own workspace-edit version.

Import `@repo-prism/host-session/protocol` for the types and guards alone —
that entry point does not reach Core, which is what lets the Console validate
a request before deciding to load the engine.

**Must never** import `vscode`. It runs in the extension host *and* in a plain
Node daemon.

## Surfaces

Each of these consumes `@repo-prism/core` for analysis and computes nothing
itself. The MCP server additionally consumes `@repo-prism/dispatch` for the
teammate workflow (ADR-0035) and `@repo-prism/dispatch-hub` for the jobs
board (ADR-0043).

### `@repo-prism/cli`

The `prism` binary. A declarative command table that the program builds itself
from, so a new command cannot forget `--limit` or spell `--fail-on` differently.

**Must never** write to stdout except the command's own data, and must never
call `process.exit` outside its single top-level handler. Both are pinned by a
boundary test.

### `@repo-prism/mcp-server`

The `prism-mcp` binary. Intelligence tools over Core, plus Dispatch tools over
`@repo-prism/dispatch`, on the same stdio server named `prism`.

**Must never** expose Core's consent-gated analysis APIs. Intelligence tools
stay read-only. Dispatch tools are a second path (ADR-0035): jobs, OAuth, and
local workers, never an index.

### `@repo-prism/dispatch`

Chat-native jobs, memories, OAuth drivers, worktree adopt/create, and local
workers on the host's own agent CLI — Cursor SDK in Cursor, Claude Code CLI in
Claude Code (ADR-0044). Jobs are checkout-first (ADR-0045): edits land in the
user's tree uncommitted, and a worktree + job branch is the explicit or
parallel-collision path. Consumed by `@repo-prism/mcp-server` and
`@repo-prism/dispatch-hub`. Makes no network calls and stores no third-party
credentials: `host-connectors.ts` learns which connectors are signed in —
Cursor session MCP tools (not the plugin download cache, and not a plugin
that still only exposes `mcp_auth`) plus Claude plugin installs and host
MCP configs — names and capabilities, never tokens — and
`fill-contract.ts` turns that into the sections `start_my_day` asks the host
agent to fill with its own tools (ADR-0049). Cursor workers sign in via a
browser Cursor login (ADR-0038), not mcp.json; Claude workers reuse the
machine's `claude` sign-in.
Job ids are tickets or title slugs; chat never speaks `job-<hex>` (ADR-0039).
Workers run out-of-process; live status and
finished/failed results are reaped into `list_jobs` / start-my-day (ADR-0040).
Job agents do not attach Prism MCP; Prism worktrees symlink the host
`node_modules` (ADR-0041). Prism verifies after
the agent stops and commits worktree placements; in-process subagents are on
(ADR-0042). The jobs board is
a separate package (`@repo-prism/dispatch-hub`, ADR-0043).

**Must never** be imported by `@repo-prism/core`, any engine package, or the
IDE extension. The extension talks to the hub over HTTP.

### `@repo-prism/plugin`

The **Prism plugin pack** (ADR-0050): skills and slash commands that say how
Prism's tools compose, and how to combine them with the connectors the editor
already has. Reviewing a PR means impact analysis before opinion; editing
unfamiliar code means checking what depends on it first. A tool list cannot say
either, and `instructions.ts` is the wrong place to — every client pays for it
on every session.

`bun run build` emits `dist/pack/`, installable by both Cursor and Claude Code.
Both manifests are generated from `src/definition.ts`, because the two hosts
disagree in shape and a pack maintained as two hand-written JSON files drifts
silently — it still installs, just missing whatever was forgotten. Skill prose
stays as markdown on disk; the build copies it and refuses to emit a pack whose
definition and directories disagree.

Depends on nothing. It ships text, not code, and importing it at runtime would
mean the pack had become a second way to configure the server.

### `@repo-prism/dispatch-hub`

The **Prism Console**: a user-level loopback daemon on `prismhq.localhost:17330`
(`127.0.0.1` keeps working) with two planes (ADR-0048).

The Jobs plane is always on and Core-free — it watches every registered
workspace's `.prism/dispatch/` tree, serves the dashboard over HTTP and SSE,
drains the job queue (ADR-0047), and fires OS notifications when a teammate
finishes. The Intelligence plane loads `@repo-prism/host-session` on the first
`POST /api/host` and holds one Core session at a time, evicted when idle, so a
user who only watches jobs never pays for the engine.

Spawned by host `prism-mcp`. State lives in `~/.prism/hub/`. Every request
needs the token from `~/.prism/hub/hub.json`. `PRISM_HUB=0` opts out.

**Must never** be imported by Core or by the IDE extension (the extension uses
HTTP, and finds the Console by reading the hub record). Workers never spawn it.
**Must never** import Core statically — the lazy `import()` in
`intelligence.ts` is the only path, and a static edge would put the engine back
in the always-on process.

### `@repo-prism/vscode-extension`

The **Prism** IDE extension. Hosts the app-shell in a webview, bridges it to
Core over RPC via `@repo-prism/host-session`, and owns the extension-side
concerns: indexing lifecycle, file watching, and the content security policy.

*Open in Browser* opens the Prism Console rather than starting a server of its
own; the `:17321` bridge was retired by ADR-0048.

### `@repo-prism/cursor-extension`

A packaging overlay on the VS Code extension rather than a second
implementation. Same build output, different marketplace identity.

### `@repo-prism/playground` (in `apps/`)

A browser host for the same screens, served by Vite against a local repository.
The dev-tools loop the extension webview does not have, which is why screen work
usually happens here first.

### `@repo-prism/website` (in `apps/`)

Next.js + Fumadocs app that serves the public marketing site and documentation
(and admin architecture docs). Replaces the VitePress docs app. Markdown source
stays in `/docs` at the repository root.

## Development only

### `@repo-prism/test-support`

Fixture builders for the test suite: real git repositories, created in a temp
directory and thrown away afterwards. It exists so that a testbed shape is
defined once rather than rebuilt inline in each test file, where copies drift
apart.

Never published, and never imported by anything that ships — a `devDependency`
in every package that uses it. See
[fixtures](https://github.com/Shailesh200/prism/blob/main/fixtures/README.md)
for which fixture to reach for.

## The rule, restated

```
surface  →  @repo-prism/core  →  engine internals  →  @repo-prism/shared
mcp-server  →  @repo-prism/dispatch  (jobs only; ADR-0035)
mcp-server  →  @repo-prism/dispatch-hub  (the Console; ADR-0048)
```

Arrows point at what may be imported. There is no arrow from a surface to an
internal package, and adding one fails the build on the CLI and the MCP server.

## Related

[Architecture overview](./overview.md) · [Core SDK](./core-sdk.md) · [Decisions](./decisions.md)

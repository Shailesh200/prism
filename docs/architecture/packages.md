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

Extracted from the IDE extension so a second host could answer the same RPC
(ADR-0048) instead of the extension running a second, tokenless server on
`:17321`. The filesystem-rename fallback lives here; the extension injects its
own workspace-edit version.

Import `@repo-prism/host-session/protocol` for the types and guards alone —
that entry point does not reach Core, which is what lets a host validate a
request before deciding to load the engine.

**Must never** import `vscode`. It runs in the extension host *and* in a plain
Node daemon.

### `@repo-prism/daemon`

The Prism graph daemon (ADR-0063): one local process per machine that keeps
each open repository indexed and fresh from file-system events, and answers
tool calls over loopback so MCP servers, the CLI and hooks share one index
instead of building their own. Holds the single-instance lock, the 0600 record
under `~/.prism/daemon`, the loopback server, the attach-first client, and the
memory, priority and battery limits.

The process itself is `prism-mcp --daemon`, because it serves the MCP tool
definitions. `@repo-prism/daemon` is the reusable part; `./server` is a
separate entry so a caller that only attaches never loads Core.

**Must never** bind anything but loopback, edit a file, run a model, or run a
job.

## Surfaces

Each of these consumes `@repo-prism/core` for analysis and computes nothing
itself.

### `@repo-prism/cli`

The `prism` binary. A declarative command table that the program builds itself
from, so a new command cannot forget `--limit` or spell `--fail-on` differently.

**Must never** write to stdout except the command's own data, and must never
call `process.exit` outside its single top-level handler. Both are pinned by a
boundary test.

### `@repo-prism/mcp-server`

The `prism-mcp` binary: Intelligence tools over Core, on a stdio server named
`prism`. Seven tools are registered by default (`prepare_change`,
`blast_radius`, `guard_session`, `test_impact`, `repository_overview`,
`find_symbol`, `explain_area`); `PRISM_MCP_FULL=1` registers the rest. No
Dispatch tool is registered (ADR-0064).

**Must never** expose Core's consent-gated analysis APIs. It no longer depends
on `@repo-prism/dispatch` or `@repo-prism/dispatch-hub`.

### `@repo-prism/checks`

Detects the repo's own typecheck, lint, and test scripts and runs the ones a change reaches. Used by the change receipt and the stop hook. Not Core.

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

### `@repo-prism/vscode-extension`

The **Prism** IDE extension. Hosts the app-shell in a webview, bridges it to
Core over RPC via `@repo-prism/host-session`, and owns the extension-side
concerns: indexing lifecycle, file watching, and the content security policy.
The `:17321` bridge was retired by ADR-0048.

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

## Being removed

Dispatch was removed from the product and from MCP by ADR-0064. Its two
packages stay in the tree until a later milestone deletes them. No other
workspace package lists them as a dependency, and no new code may.

### `@repo-prism/dispatch`

The removed job runner: background jobs, standups, workers, and the old memory
store. Its Envelope ledger and last-Prepare code moved into
`@repo-prism/core`, and memories moved to `prism remember`.

### `@repo-prism/dispatch-hub`

The removed Prism Console: the loopback jobs board and its notifications. It
depends on `@repo-prism/dispatch`.

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
```

Arrows point at what may be imported. There is no arrow from a surface to an
internal package, and adding one fails the build on the CLI and the MCP server.

## Related

[Architecture overview](./overview.md) · [Core SDK](./core-sdk.md) · [Decisions](./decisions.md)

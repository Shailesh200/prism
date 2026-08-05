# The packages

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

## Surfaces

Each of these consumes `@repo-prism/core` and computes nothing itself.

### `@repo-prism/cli`

The `prism` binary. A declarative command table that the program builds itself
from, so a new command cannot forget `--limit` or spell `--fail-on` differently.

**Must never** write to stdout except the command's own data, and must never
call `process.exit` outside its single top-level handler. Both are pinned by a
boundary test.

### `@repo-prism/mcp-server`

The `prism-mcp` binary. Read-only tools over stdio for AI agents.

**Must never** expose a consent-gated capability. An agent cannot consent on the
user's behalf, so those capabilities are absent rather than guarded.

### `@repo-prism/vscode-extension`

The **RepoPrism** extension. Hosts the app-shell in a webview, bridges it to
Core over RPC, and owns the extension-side concerns: indexing lifecycle, file
watching, and the content security policy.

### `@repo-prism/cursor-extension`

A packaging overlay on the VS Code extension rather than a second
implementation. Same build output, different marketplace identity.

### `@repo-prism/playground` (in `apps/`)

A browser host for the same screens, served by Vite against a local repository.
The dev-tools loop the extension webview does not have, which is why screen work
usually happens here first.

### `@repo-prism/docs` (in `apps/`)

A stub package. The documentation you are reading lives in `/docs` at the
repository root and is built by VitePress from there.

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

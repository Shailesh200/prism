---
title: How Prism is built
description: "One engine, several surfaces — every surface asks Core."
---


**One engine, several surfaces. Every surface asks the engine; none of them
computes anything.**

```
  CLI    MCP server + hooks    GitHub Action
   └───────────┴──────────────────┘
                     │
                @repo-prism/core          ← the only public API
                     │
     analyzer · indexer · graph-engine · intelligence
                     │
                @repo-prism/shared        ← types and contracts
```

## The rule that shapes everything

**Surfaces consume `@repo-prism/core` and nothing else.**

Not a style preference. The alternative — each surface reaching into the engine
internals it happens to need — produces four implementations of "what is the
blast radius of this file" that drift apart, and then a support conversation
about why the CLI and the editor disagree.

Prism has already avoided that once: test-runner logic existed separately in two
surfaces, drifted, and turned out to contain two different bugs. Consolidating
it into Core removed both.

The CLI and the MCP server each carry a boundary test: importing an internal
package from those surfaces fails the build.

## The layers

**`@repo-prism/shared`** — types, DTOs, Zod schemas, and the small pure functions
every layer needs to agree on. `riskToBand` lives here, which is why the CLI and
the editor cannot disagree about what "High" means. No I/O, no Node-only APIs, so
it runs in a browser webview unchanged.

**Engine internals** — the analyzer parses (Oxc for TypeScript and JavaScript),
the indexer persists to SQLite in `.prism/`, the graph engine builds and queries
graphs, and the intelligence packages derive stack detection, entry points and
the facts Prepare and review read.

**`@repo-prism/core`** — the public SDK. `PrismWorkspace` is the whole surface: open a
workspace, ask questions, get typed results. Every method returns
`Result<T, PrismError>` rather than throwing, so a caller cannot forget that a
call can fail.

**Surfaces** — the CLI and the MCP server (with its hooks and plugin pack).
Each is a presentation layer over the same answers.



## Local-first

No network calls on any analysis path, enforced by a test that runs the whole
analysis surface with the socket layer trapped. The optional network features
are individually consented and sit outside that path.

## Where to read more

The full architecture documents live in
[`plans/architecture/`](https://github.com/Shailesh200/prism/tree/main/plans/architecture),
and every significant decision has an ADR in
[`plans/adr/`](https://github.com/Shailesh200/prism/tree/main/plans/adr).

The ones worth reading first:

- **ADR-0004** — surfaces consume Core only
- **ADR-0024** — opt-in network integrations
- **ADR-0027** — multi-lane blast radius signals
- **ADR-0030** — MCP transport and lifecycle

## Related

[Core SDK](./core-sdk.md) · [Contributing](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md)

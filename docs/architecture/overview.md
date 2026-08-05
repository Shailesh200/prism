# How Prism is built

**One engine, several surfaces. Every surface asks the engine; none of them
computes anything.**

```
  extension    CLI    MCP server    playground
       └────────┴─────────┴─────────────┘
                     │
                @prism/core          ← the only public API
                     │
     analyzer · indexer · graph-engine · intelligence
                     │
                @prism/shared        ← types and contracts
```

## The rule that shapes everything

**Surfaces consume `@prism/core` and nothing else.**

Not a style preference. The alternative — each surface reaching into the engine
internals it happens to need — produces four implementations of "what is the
blast radius of this file" that drift apart, and then a support conversation
about why the CLI and the editor disagree.

Prism has already avoided that once: test-runner logic existed separately in the
extension and the playground, drifted, and turned out to contain two different
bugs. Consolidating it into Core removed both.

The CLI and the MCP server each carry a boundary test: importing an internal
package from those surfaces fails the build. The extension and the playground
follow the same rule and currently hold to it, but are not yet pinned by an
equivalent test.

## The layers

**`@prism/shared`** — types, DTOs, Zod schemas, and the small pure functions
every layer needs to agree on. `riskToBand` lives here, which is why the CLI and
the editor cannot disagree about what "High" means. No I/O, no Node-only APIs, so
it runs in a browser webview unchanged.

**Engine internals** — the analyzer parses (Oxc for TypeScript and JavaScript),
the indexer persists to SQLite in `.prism/`, the graph engine builds and queries
graphs, and the intelligence packages derive health, features, stack detection
and reports.

**`@prism/core`** — the public SDK. `PrismWorkspace` is the whole surface: open a
workspace, ask questions, get typed results. Every method returns
`Result<T, PrismError>` rather than throwing, so a caller cannot forget that a
call can fail.

**Surfaces** — the extension, CLI, MCP server, and playground. Each is a
presentation layer over the same answers.

## Shared presentation

The extension and the playground render the same screens, from `@prism/app-shell`.
Each host provides an `AppShellClient` implementation — the extension goes over
webview RPC, the playground over HTTP — and the screens do not know which they
are talking to.

That is why the browser playground is a legitimate way to develop the editor
extension: same components, better dev-tools loop.

## Consent lives in the engine

Network capability is gated by `.prism/consent.json`, read by Core itself.

Callers cannot pass a "the user agreed" flag. An earlier design let them, and
every caller passed `true` — the gate recorded consent instead of requiring it.
Putting the decision inside the engine means every surface is bound by it and
none can route around it. See
[consent and privacy](../concepts/consent-and-privacy.md).

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

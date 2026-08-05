# From a file on disk to a number on screen

**One path, followed once. Every report in Prism is a different projection of
the same journey, which is why they agree with each other.**

```
file on disk
    │  walk + ignore rules
    ▼
candidate file list
    │  hash contents
    ▼
changed files only
    │  parse (Oxc for TS/JS)
    ▼
symbols · imports · diagnostics
    │  persist
    ▼
.prism/cache/index.sqlite
    │  build
    ▼
dependency · knowledge · feature graphs
    │  derive
    ▼
DNA · health · blast radius · map · reports
    │  DTO from @prism/shared
    ▼
CLI table · MCP tool result · a screen
```

## Walking

Prism enumerates files, applying your ignore rules, `.gitignore`, and a builtin
list. Generated output that slips through this stage is the single most common
cause of a slow index and a surprising file count.

## Hashing

Each candidate is hashed. A file whose hash matches the stored one is not
re-parsed — it is already in the index, unchanged.

This is what makes the second index fast and a save-triggered reindex nearly
instant. It is also why the correctness of the hash matters more than the speed
of the parser.

## Parsing

Files in a supported language go to a language plugin. For TypeScript and
JavaScript that is Oxc, which produces symbols, imports and diagnostics.

Files in other languages are recorded but not parsed, so they have structure,
size and churn but no symbol-level detail. See
[known limitations](../reference/known-limitations.md).

Parsing never executes the code.

## Persisting

The result goes to SQLite in `.prism/cache/`. Facts about your code, not your
code.

Everything downstream reads from here rather than from disk, which is the
mechanism behind the guarantee that the map and the blast radius cannot
disagree: there is only one thing for them to disagree about.

## Building graphs

Three graphs, all over the same store:

| Graph | Edges are |
|---|---|
| [Dependency](../concepts/dependency-graph.md) | imports and re-exports |
| [Knowledge](../concepts/knowledge-graph.md) | semantic relationships between symbols |
| [Feature](../concepts/feature-graph.md) | inferred membership of a capability |

## Deriving

Reports are computed from the graphs and the index — never by re-reading the
repository. A report that needed to re-read files would be a report that could
disagree with the one next to it.

Each derived value carries its
[provenance](../concepts/signal-provenance.md): measured, estimated, or
unavailable.

## Crossing the boundary

Everything leaving Core is a DTO from `@prism/shared` with a matching Zod
schema. Surfaces render DTOs; they never compute.

The same DTO becomes a CLI table, an MCP tool result, and a React screen. That
is the last link in the chain — three surfaces cannot render different numbers
from one object.

## Watch mode

While an editor is open, a save re-enters the pipeline at the hashing step for
that file alone. Changes are debounced and coalesced; a file that changes during
a reindex is picked up by the next pass rather than dropped.

## Related

[The repository index](../concepts/repository-index.md) · [Architecture overview](./overview.md) · [Packages](./packages.md)

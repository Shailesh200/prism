# The repository index

**The index is Prism's parsed copy of your repository. Every other answer is
derived from it, which is why they all agree with each other.**

## What it holds

When you run `prism index` — or open a repository in the extension — Prism walks
your files, parses the ones it understands, and records:

| | |
|---|---|
| **Files** | Path, size, language, and a hash of the contents |
| **Symbols** | Functions, classes, types, and exports, with where they are defined |
| **Imports** | Which file refers to which, and how |
| **Roles** | Whether a file looks like a test, a config, a type declaration, or source |

It does not store your source code. It stores facts *about* your source code.

The result lives in `.prism/cache/index.sqlite`, a SQLite database inside your repository.

## Why one index matters

Prism could compute a dependency graph on demand, then compute a health score
separately, then compute a map. It doesn't, and the reason is not performance.

If two features each read the repository their own way, they will eventually
disagree — one counts a test file, the other doesn't; one follows a re-export,
the other stops. Then the map says a file has three dependents and the blast
radius says five, and now you cannot trust either.

One index means one answer. When the map and the impact analysis disagree, it is
a bug in one derivation rather than a difference of opinion between two.

## Incremental updates

Re-indexing an unchanged repository does almost nothing. Prism hashes each file
and re-parses only what changed, then updates the parts of the graph that
depended on it.

In the editor, this happens as you save. From the CLI, each command reuses the
existing index and refreshes what is stale.

## What gets skipped, and why you should look

Prism skips:

- Files over the size limit (5 MB by default, configurable in Settings)
- Anything matching your exclude patterns — `node_modules`, `dist`, build output
- Files it cannot parse

Skips are reported, not hidden. A file that failed to parse is a warning on the
index run, and the rest of the index continues; one malformed file does not cost
you the whole analysis.

If `prism index` reports a large number of skipped files, check your excludes
before you conclude anything from the results. An index that never saw half your
code will happily tell you that half your code has no dependents.

## What it is not

The index is not a search engine, and Prism is not trying to replace one. It
holds structure, not content: it can tell you that `cart.ts` exports `total` and
that four files import it, not which lines mention the word "total".

## Related

[Dependency graph](./dependency-graph.md) · [Knowledge graph](./knowledge-graph.md) · [Signal provenance](./signal-provenance.md)

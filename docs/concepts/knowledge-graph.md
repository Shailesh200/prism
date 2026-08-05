# The knowledge graph

**The dependency graph knows that one file imports another. The knowledge graph
knows what those files *are*.**

## The difference

The [dependency graph](./dependency-graph.md) has one kind of node (a file) and
one kind of edge (an import). It is precise and it is shallow.

The knowledge graph adds the things you would say out loud when describing the
codebase to someone:

| Node kind | Example |
|---|---|
| File | `src/features/cart.ts` |
| Symbol | the exported function `total` |
| Package | `@acme/web` in a monorepo |
| Feature | "checkout", inferred from files that move and appear together |
| Domain | frontend, backend, data, infrastructure |
| Route | `GET /api/cart`, found in a router definition |

And edges that mean more than "imports":

`defines`, `references`, `belongs to`, `tests`, `configures`, `serves`.

## Why the extra layer

Because the questions people actually ask are about concepts, not files.

"Where is checkout implemented" is a feature question. "What does the API
surface look like" is a route question. "Which package owns this" is a package
question. Answering any of them from the file graph alone means the reader does
the translation, every time.

## Confidence is part of the answer

Some of this is derived from firm evidence and some is inferred.

A `defines` edge is certain — the parser saw the declaration. A **feature** is
a judgement: Prism grouped files by naming, directory structure, import
clustering and how often they change together, then gave the group a name. That
judgement can be wrong.

So Prism reports a confidence with anything inferred, and shows it. A feature at
40% confidence is a suggestion; one at 90% is close to a fact. Treating both as
equally true would make the whole graph untrustworthy, which is why
[signal provenance](./signal-provenance.md) exists.

## Using it

```bash
prism symbol total            # where is this defined
prism refs total              # what references it
prism route "/api/cart"       # what handles this route
prism features                # inferred features, with confidence
prism explore src/features/cart.ts
```

`prism explore` is the broad one: for a file, it reports what uses it, what
looks similar to it, and who has been working in it.

In the extension, the same information appears as the Code Explorer and the
feature layer of the map.

## Related

[Dependency graph](./dependency-graph.md) · [Feature graph](./feature-graph.md) · [Signal provenance](./signal-provenance.md)

# The repository map

**Your codebase drawn as a place, so you can see its shape instead of reading a
file tree.**

## Why a map

A file tree tells you what is nested inside what. It does not tell you which
parts are large, which are connected, which are churning, or which are risky.
Those are spatial questions, and a tree answers none of them.

The map lays the repository out so that related things sit near each other, then
lets you overlay a dimension onto that layout. Structure comes from the code;
meaning comes from the layer you pick.

## Zoom levels

| Level | What a node is |
|---|---|
| **Repository** | The whole thing |
| **Package** | One workspace package |
| **Feature** | An inferred [feature](../concepts/feature-graph.md) |
| **File** | One file |
| **Symbol** | One function, class or type |

Zooming is not just scaling — each level re-aggregates. At package level, edges
are the sum of the file-level imports crossing that boundary, which is what turns
an unreadable hairball into an architecture diagram.

## Layers

A layer colours the map by one dimension:

| Layer | Shows |
|---|---|
| **Coupling** | How entangled each area is |
| **Churn** | How much each area has changed recently, from git history |
| **Tests** | Where tests exist, and coverage where it is measured |
| **Risk** | Composite risk, banded |
| **Ownership** | Who has been working where |
| **Features** | Which inferred feature each file belongs to |

Layers that need git say so when git is unavailable rather than rendering an
empty map that looks like a repository nobody has touched. See
[signal provenance](../concepts/signal-provenance.md).

## Reading it

**Large node.** More code, more symbols, or more churn depending on the layer.

**Dense edges between two regions.** A boundary that is not doing its job. Two
packages that import each other heavily are one package with extra steps.

**An isolated cluster.** Either well-encapsulated or dead. The dependents count
tells you which.

**A hub with many inbound edges.** Central. Changes here have a wide
[blast radius](../concepts/blast-radius.md), and the map is usually where you
first notice it.

## Bookmarks

Anywhere on the map can be bookmarked with a note. Useful for onboarding — "start
here", "this is the auth boundary", "do not touch without reading the ADR" — and
they persist in `.prism/`.

## From the terminal

```bash
prism map
prism landmarks    # the notable places, without the layout
prism packages     # every package and where it lives
```

## Related

[Feature graph](../concepts/feature-graph.md) · [Dependency graph](../concepts/dependency-graph.md)

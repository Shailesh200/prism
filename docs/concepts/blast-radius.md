# Blast radius

**What else is affected if you change this file. The question you would
otherwise answer with a nervous grep and a hope.**

## What it computes

Start at the file you are about to change. Walk the
[dependency graph](./dependency-graph.md) backwards through everything that
depends on it, and everything that depends on those, and so on.

```
                        ┌─▶ CartPage.tsx ──▶ App.tsx
src/features/cart.ts ───┤
                        └─▶ api/server.ts
```

Changing `cart.ts` puts three other files in the blast radius: two directly, one
transitively.

Prism reports:

| | |
|---|---|
| **Direct dependents** | Files that import this one |
| **Transitive dependents** | Everything reachable from those |
| **Affected tests** | Which test files cover any of the above |
| **Affected features** | Which [features](./feature-graph.md) contain them |
| **A risk score** | 0–100, banded — see [risk bands](./risk-bands.md) |

## How the score is built

Reach is the largest input, but not the only one. A file that fifty others
import is riskier to change than one imported by two — but "fifty leaf
components import this icon" and "fifty modules import this auth check" are not
the same situation, so Prism also weighs:

- How far the change propagates, not just how wide
- Whether the affected files are covered by tests
- How central the affected files are in the graph
- Whether the affected code is in one feature or spread across several

Spread across features matters more than raw count. A change contained in one
area is something a reviewer can hold in their head; the same number of files
across six features is not.

## Edit versus delete

Changing a file's behaviour and removing it entirely are different risks, so
Prism asks the second question separately:

```bash
prism blast src/features/cart.ts
prism blast src/features/cart.ts --delete
prism safe-delete src/features/cart.ts
```

`--delete` weighs the same graph towards what would break outright.
`safe-delete` goes further and reports **blockers** — things that would fail to
resolve — and **orphans**, files that would be left dead because nothing else
reached them.

## What it cannot see

The blast radius is only as good as the dependency graph, and the graph is
static. It does not know about:

- Dynamic imports with computed paths
- Runtime dependency injection
- Code called across a network boundary
- Anything reflective

If your architecture leans on those, treat the blast radius as a floor rather
than a complete answer. Prism will not invent an edge it cannot see, which means
the risk it reports is real but may not be all of it.

The other limit is honest too: static analysis cannot tell whether your change
is *breaking*. Adding an optional parameter and deleting an exported function
have identical blast radii. Prism tells you what is reachable; deciding what
that means is still yours.

## In CI

```bash
prism blast src/payments/charge.ts --fail-on high
```

Exits `1` when the band is High or above. Combined with `prism review`, which
does the same for everything in your working tree, this is the CLI's main use
in a pipeline:

```bash
prism review --fail-on high
```

## Related

[Dependency graph](./dependency-graph.md) · [Risk bands](./risk-bands.md) · [Impact analysis](../features/impact-analysis.md)

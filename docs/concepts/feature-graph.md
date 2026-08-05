# The feature graph

**A guess at which files, together, implement one user-facing thing — and how
strong the guess is.**

## Why guess at all

Codebases are organised by technical layer far more often than by feature. The
checkout flow is a component here, a hook there, an API route somewhere else, a
schema in a fourth place, and tests in a fifth. Nothing in the repository says
"these five things are checkout".

But that is the unit people work in. "Is checkout risky?" and "who owns
checkout?" are the real questions; "is `src/hooks/useCart.ts` risky?" is a
proxy for them.

So Prism infers features. And because inference can be wrong, it always reports
how sure it is.

## What the evidence is

Prism combines signals that are individually weak and jointly reasonable:

| Signal | Reasoning |
|---|---|
| **Naming** | `cart.ts`, `CartPage.tsx`, `cart.test.ts` share a stem |
| **Directory structure** | A folder is often already a feature boundary |
| **Import clustering** | Files that import each other and little else form a cluster |
| **Co-change** | Files that git history shows changing in the same commits, repeatedly |
| **Route and entry points** | A route handler anchors everything it reaches |

Co-change is the strongest signal and the one that needs git. Without history,
Prism falls back to structure and naming, and confidence drops accordingly —
which it says, rather than quietly returning a weaker answer that looks the
same.

## Reading the confidence

Each feature carries a percentage. It is not a probability in any rigorous
sense; it is how much of the available evidence agreed.

| Range | How to read it |
|---|---|
| **80–100%** | Multiple independent signals agree. Treat it as real |
| **50–79%** | Plausible. Worth checking before acting on it |
| **Below 50%** | A hint. Prism is telling you it noticed something, not that it knows |

The right response to a low-confidence feature is usually to look at its member
files and decide for yourself — which is why Prism lists them.

## When it gets things wrong

Two failure modes, both worth recognising:

**Splitting.** One feature reported as two, usually because half of it lives
under a different naming convention. Look for two features with overlapping
dependents.

**Merging.** Two features reported as one, usually because they share a large
utility module that dominates the import clustering.

Neither is a silent failure. Both show up as lower confidence, which is the
signal to look closer.

## Using it

```bash
prism features
prism features --limit 10
```

In the extension, features appear as a layer on the [map](../features/map.md)
and as groupings in impact analysis.

## Related

[Knowledge graph](./knowledge-graph.md) · [Signal provenance](./signal-provenance.md) · [Blast radius](./blast-radius.md)

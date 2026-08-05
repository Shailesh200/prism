# The dependency graph

**Which file imports which. It is the simplest thing Prism builds and the thing
most other answers are built on.**

## The shape of it

Every file is a node. Every import is a directed edge from the importer to the
imported. That is the whole model.

```
src/api/server.ts ──imports──▶ src/features/cart.ts
src/ui/Cart.tsx   ──imports──▶ src/features/cart.ts
```

From `cart.ts`'s point of view, those two files are its **dependents**: they
would notice if it changed. The files `cart.ts` itself imports are its
**dependencies**.

The distinction matters constantly and the words are easy to swap. A useful
mnemonic: your dependents *depend on you*, so they are the ones you can break.

## What Prism resolves

| Handled | Notes |
|---|---|
| Relative imports | `./cart.js`, `../features/cart` |
| Path aliases | Read from `tsconfig.json` |
| Package entry points | Resolved to the package, not into it |
| Re-exports | `export * from './cart.js'` creates an edge |
| Type-only imports | Recorded, and distinguishable from value imports |

| Not handled | Why |
|---|---|
| `require(variable)` | The target is not known until runtime |
| Dynamic `import()` with a computed path | Same |
| Cross-language references | Prism parses TypeScript and JavaScript |
| Runtime dependency injection | Nothing in the source says what is wired to what |

That last group is the honest limit of static analysis. If your architecture
routes everything through a registry that resolves strings at runtime, the graph
will look sparser than the real coupling. Prism does not guess at those edges,
because a guessed edge is worse than a missing one: it produces a confident
answer that is wrong.

## Cycles

A cycle is a group of files that import each other, directly or in a loop:

```
a.ts → b.ts → c.ts → a.ts
```

Cycles are not automatically bugs. They are, reliably, a sign that a boundary is
not where someone thought it was — and they make everything harder: incremental
builds, tree-shaking, testing a module in isolation, and reasoning about
initialisation order.

```bash
prism cycles
```

Prism lists each cycle with the loop closed — repeating the first file at the
end — so you can read the loop rather than infer it.

## Packages, not just files

In a monorepo the file graph is too fine-grained to see anything. Most commands
accept `--packages` to aggregate edges up to the package level, which shows you
the architecture rather than the plumbing:

```bash
prism deps --packages
```

## Where it is used

The dependency graph is the substrate for:

- [Blast radius](./blast-radius.md), by walking dependents transitively
- Safe delete, by asking whether anything still depends on a file
- The [repository map](../features/map.md), for how regions are laid out
- [Health](./health-score.md), through coupling and cycle factors

## Related

[Repository index](./repository-index.md) · [Knowledge graph](./knowledge-graph.md) · [Blast radius](./blast-radius.md)

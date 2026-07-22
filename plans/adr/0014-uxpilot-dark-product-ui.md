# ADR-0014: UXPilot dark product UI (relock)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-22 |
| Decision makers | Owner, Architect |
| Related milestones | M-042 (UI System v2) |
| Related | [ADR-0013](./0013-unified-map-and-git-signals.md), [ADR-0001](./0001-product-name-prism.md) |
| Supersedes (product UI only) | Light-first "Signal Chart" default in `plans/DESIGN_SYSTEM.md` / `plans/mockups/DESIGN.md` |

## Context

The product UI was previously locked to a light-first "Signal Chart" system (teal `#0F766E`, Satoshi + IBM Plex Mono, top bar · map · inspector). The owner produced high-fidelity UXPilot mockups (archived under `plans/mockups/screens/html/`) for the Repository Map and an Overview dashboard, and directed (Option B) that the product UI match those designs pixel-close rather than rematerialize them into the light system.

The mockups are a dark theme: deep navy canvas, cyan `#00C2C2` primary, violet `#6C63FF` accent, Inter + JetBrains Mono, a left KPI sidebar, a dependency edge graph, and blast rings on the selected node.

## Decision

1. **Relock the product UI to the UXPilot dark system.** Dark navy surfaces, cyan `#00C2C2` brand, violet `#6C63FF` accent, Inter + JetBrains Mono become the product default for app surfaces (`@prism/ui`, playground; later VS Code/Cursor webviews).
2. **Token swap, not fork.** `packages/ui/src/tokens.css` keeps its `--prism-*` token names but takes dark values, so the entire existing map/inspector/treemap/command-palette reskins from one file. Surfaces still consume tokens only.
3. **Map shell = top bar + left KPI sidebar + graph canvas + right inspector.** Owner overrides from earlier simplification: keep the left sidebar (repo stats, feature regions, layers, recent) and the dependency edge graph. Blast rings render only on the selected node.
4. **Overview is a secondary screen**, not the Map home. It is derived locally from the RepositoryMap graph (no Plotly, no network) to stay offline/local-first.
5. **Landing page deferred** to the marketing/docs site (M-038 / Vercel); not built in M-042.

## Consequences

- The light Signal Chart remains documented but is no longer the product default; a future light theme is a token flip, not a rewrite.
- Signal semantics (amber risk, emerald safe, rose extreme) are preserved as accent colors.
- Brand mark (faceted P) is unchanged; the diamond SVG in the mockups is not adopted.
- `plans/DESIGN_SYSTEM.md`, `plans/mockups/DESIGN.md`, `plans/mockups/LOCKED.md`, and `plans/mockups/screens/SPECS.md` carry a relock banner pointing here.

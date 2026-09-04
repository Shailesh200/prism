# @repo-prism/cursor-extension

Cursor packaging overlay for Prism ([ADR-0020](../../plans/adr/0020-cursor-packaging-overlay.md)).

**Website:** [https://www.prismhq.in](https://www.prismhq.in) · **Docs:** [https://www.prismhq.in/docs/start/install](https://www.prismhq.in/docs/start/install)

This package does **not** reimplement analysis. It stages the same
`@repo-prism/vscode-extension` build (`dist` + `media`) with Cursor-oriented
manifest branding. The extension host still calls **`@repo-prism/core` only**.

Published installs use the VS Code / Open VSX listing **Prism**
(`prismhq.repo-prism`).

## Develop / try in Cursor

```bash
# from repo root
bun install
bun run --filter @repo-prism/cursor-extension build
```

In **Cursor**, open this repo → **Run and Debug** → **Run Prism Cursor Extension** (F5).

Commands match the VS Code package (context menus included):

| Command | ID |
|---|---|
| Prism: Open Prism | `prism.open` |
| Prism: Open Repository Map | `prism.openRepositoryMap` |
| Prism: Show Health | `prism.showHealth` |
| Prism: Reindex | `prism.reindex` |
| Prism: Open in Browser | `prism.openInBrowser` |
| Prism: Blast Radius | `prism.blastRadius` |
| Prism: Safe Delete Check | `prism.safeDelete` |
| Prism: Explore Ownership | `prism.exploreOwnership` |
| Prism: Explain This Area | `prism.explainArea` |
| Prism: Reveal on Map | `prism.revealOnMap` |
| Prism: Review Changes | `prism.reviewChanges` |
| Prism: Getting Started Tour | `prism.openWalkthrough` |

Right-click a file in the editor or explorer for Blast Radius / Safe Delete /
Ownership / Explain / Reveal on Map. SCM changed files also get Review Changes.

A **Getting Started** walkthrough appears in Cursor’s walkthroughs list and
opens the in-app tour.

**Open in Browser** opens the Prism Console (`http://prismhq.localhost:17330`) —
not a separate Vite playground, and no longer a loopback server inside the
extension (ADR-0048).

## MCP coexistence

When `@repo-prism/mcp-server` is available:

- **Extension** — human UI (Map, Overview, Blast, …) in the IDE
- **MCP** — agent tools against the same Core APIs — [setup](https://www.prismhq.in/docs/start/install)

Both are local-first surfaces over Core.

# @repo-prism/cursor-extension

Cursor packaging overlay for Prism (M-032, [ADR-0020](../../plans/adr/0020-cursor-packaging-overlay.md)).

This package does **not** reimplement analysis. It stages the same
`@repo-prism/vscode-extension` build (`dist` + `media`) with Cursor-oriented
manifest branding. The extension host still calls **`@repo-prism/core` only**.

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

**Open in Browser** serves the same Core session over a loopback bridge
(`http://127.0.0.1:17321`) — not a separate Vite playground.

## MCP coexistence

When `@repo-prism/mcp-server` is available (M-026+):

- **Extension** — human UI (Map, Overview, Blast, …) in the IDE
- **MCP** — agent tools against the same Core APIs

Both are local-first surfaces over Core. Enabling MCP does not replace the
extension; they share repository intelligence without competing indexes in the
product architecture (each process owns its own Core session).

## Packaging note

Marketplace / Open VSX publish is out of scope for M-032. Local F5 /
`extensionDevelopmentPath` is the supported install path.

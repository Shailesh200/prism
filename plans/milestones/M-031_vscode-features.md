# M-031 — VS Code Map + Explorer

| Field | Value |
|---|---|
| Branch | `milestone/M-031-vscode-features` |
| Status | Verified |
| Depends on | M-030 |
| Unlocks | M-032, M-037 |
| Packages | `@prism/vscode-extension`, `@prism/core`, `@prism/ui`, `@prism/shared` |

## Goal

Ship the full Prism dashboard in the VS Code / Cursor Extension Host webview —
Overview, Map, DNA/Profile, Domains, Blast Radius, Trends, Integrations, and
Settings — backed only by `@prism/core` (no playground HTTP).

## In Scope

- Webview app shell with sidebar navigation (playground parity)
- Host↔webview protocol for dashboard, map, overlays, impact, symbols, reindex
- `PrismSession` methods for health, DNA, git, overlays, backend, graph, blast bundle
- Commands: **Open Prism**, **Open Repository Map**, **Reindex**, **Show Health**
- Open file in editor from map / blast / inspector actions
- Manual Extension Host checklist

## Out of Scope

- Cursor-specific packaging / Marketplace (M-032)
- Extracting shared `@prism/app-shell` package (follow-up; screens copied/adapted)
- Engineering health / `exploreCode` dedicated screens (Core exists; UI later)
- Playground HTTP middleware changes

## Definition of Done

- [x] F5 Extension Host opens **Prism** webview with Overview after index
- [x] Sidebar navigates Overview → Map → DNA → Domains → Blast → Trends → Settings
- [x] Blast Radius runs against Core and shows risk / affected files
- [x] **Open** on a file path reveals it in the editor
- [x] Owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone` · Manual Extension Host checklist (F5)

## Manual checklist

1. F5 → Extension Development Host → open a sample repo
2. **Prism: Open Prism** → Overview loads (health / DNA / git)
3. Sidebar → Repository Map → nodes render
4. Sidebar → Blast Radius → pick a file → run analysis
5. Click **Open** on a result → file opens in editor
6. **Prism: Reindex** → Output “Prism” success; UI refreshes

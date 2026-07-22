# @prism/vscode-extension

VS Code / Cursor extension (M-030 shell + M-031 full dashboard). Loads
`@prism/core` in the extension host and renders the Prism app (Overview, Map,
DNA, Domains, Blast, Trends, Settings) in a webview.

## Commands

| Command | ID |
|---|---|
| Prism: Open Prism | `prism.open` |
| Prism: Open Repository Map | `prism.openRepositoryMap` |
| Prism: Show Health | `prism.showHealth` |
| Prism: Reindex | `prism.reindex` |

## Develop

```bash
# from repo root
bun install
bun run --filter @prism/ui build
bun run --filter @prism/vscode-extension build
```

Then **Run Prism Extension** (F5) via [`.vscode/launch.json`](../../.vscode/launch.json).

The build stages `better-sqlite3` under `dist/node_modules` with an Electron
prebuild (`PRISM_ELECTRON_VERSION` override supported).

## Architecture

- Extension host → `@prism/core` only (`PrismSession`)
- Webview → playground-parity screens + `@prism/ui` map; data via postMessage RPC
- Open file paths in the editor from Map / host `openFile` messages
- No network; local git via Core when available

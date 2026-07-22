# @prism/vscode-extension

VS Code extension shell (M-030). Loads `@prism/core` in the extension host and
renders `@prism/ui` `RepositoryMapView` in a webview.

## Commands

| Command | ID |
|---|---|
| Prism: Open Repository Map | `prism.openRepositoryMap` |
| Prism: Reindex | `prism.reindex` |

## Develop

```bash
# from repo root
bun install
bun run --filter @prism/ui build
bun run --filter @prism/vscode-extension build
```

Then open this repo in VS Code / Cursor and run **Run Extension** (F5) using
the root [`.vscode/launch.json`](../../.vscode/launch.json) configuration
**Run Prism Extension**.

The build stages `better-sqlite3` under `dist/node_modules` with an **Electron**
prebuild (detected from Cursor/VS Code on macOS, or `PRISM_ELECTRON_VERSION`).
That keeps the monorepo’s Node copy intact for indexer tests.

### “Cannot find module better-sqlite3” / ABI errors

Re-run the extension build, then F5 again:

```bash
bun run --filter @prism/vscode-extension build
```

If the host Electron version differs, set it explicitly:

```bash
PRISM_ELECTRON_VERSION=40.10.3 bun run --filter @prism/vscode-extension build
```

## Architecture

- Extension host → `@prism/core` only (`PrismSession`)
- Webview → `@prism/ui` + postMessage DTOs (`RepositoryMap`)
- No network; local git via Core when available

# @repo-prism/vscode-extension

VS Code / Cursor extension (M-030 shell + M-031 full dashboard). Loads
`@repo-prism/core` in the extension host and renders the Prism app (Overview, Map,
DNA, Domains, Blast, Trends, Settings) in a webview.

**Marketplace id:** `prismhq.repo-prism` (packaged as unscoped name `repo-prism` — see [PUBLISH.md](./PUBLISH.md)).

## Commands

| Command | ID |
|---|---|
| Prism: Open Prism | `prism.open` |
| Prism: Open Repository Map | `prism.openRepositoryMap` |
| Prism: Show Health | `prism.showHealth` |
| Prism: Reindex | `prism.reindex` |
| Prism: Open in Browser | `prism.openInBrowser` |

`Open in Browser` starts a loopback HTTP bridge
(`http://127.0.0.1:17321`) over the **same** `@repo-prism/core` session the
extension already indexed — no second Vite playground process. Works in F5
and installed builds.

The IDE webview itself is not a public URL; the bridge reuses the same UI
bundle and Core RPC.

## Develop

```bash
# from repo root
bun install
bun run --filter @repo-prism/ui build
bun run --filter @repo-prism/vscode-extension build
```

Then **Run Prism Extension** (F5) via [`.vscode/launch.json`](../../.vscode/launch.json).

The build stages `better-sqlite3` under `dist/node_modules` with an Electron
prebuild (`PRISM_ELECTRON_VERSION` override supported).

## Package / publish

Platform-specific VSIX (ships the correct `better-sqlite3` native binary):

```bash
bun run --filter @repo-prism/vscode-extension package:vsix
# or explicitly:
cd packages/vscode-extension && bun run scripts/package-vsix.ts --target darwin-arm64
```

Targets: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`.

Sideload and Marketplace / Open VSX steps: [PUBLISH.md](./PUBLISH.md).

## Architecture

- Extension host → `@repo-prism/core` only (`PrismSession`)
- Webview → playground-parity screens + `@repo-prism/ui` map; data via postMessage RPC
- Open file paths in the editor from Map / host `openFile` messages
- No network by default; opt-in integrations and local git via Core when available

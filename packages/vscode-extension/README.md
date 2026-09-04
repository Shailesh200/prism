# Prism

**Local-first Software Intelligence** for VS Code and Cursor.

Maps, blast radius, health, and domains — on your machine. No account. Nothing
uploaded for core analysis.

**Website:** [https://www.prismhq.in](https://www.prismhq.in)  
**Get started:** [https://www.prismhq.in/docs/start/get-started](https://www.prismhq.in/docs/start/get-started)  
**Docs:** [https://www.prismhq.in/docs](https://www.prismhq.in/docs)

**Marketplace id:** `prismhq.repo-prism`

## Quick start

1. Install this extension (search **Prism**, or use id `prismhq.repo-prism`).
2. **File → Open Folder…** on your project.
3. Command Palette → **Prism: Open Prism**.
4. Wait for indexing, then explore the map, health, and blast radius.

Prefer the terminal or agents? Same engine:

- **CLI** — [install guide](https://www.prismhq.in/docs/start/install)
- **MCP** — [install guide](https://www.prismhq.in/docs/start/install)

## Commands

| Command | ID |
|---|---|
| Prism: Open Prism | `prism.open` |
| Prism: Open Repository Map | `prism.openRepositoryMap` |
| Prism: Show Health | `prism.showHealth` |
| Prism: Reindex | `prism.reindex` |
| Prism: Open in Browser | `prism.openInBrowser` |

`Open in Browser` opens the Prism Console (`http://prismhq.localhost:17330`),
which serves the same analysis over its Intelligence plane. The Console is a
user-level daemon started by any Prism tool; if none is running the command
says so rather than opening a dead tab (ADR-0048).

## Develop (contributors)

```bash
# from repo root
bun install
bun run --filter @repo-prism/ui build
bun run --filter @repo-prism/vscode-extension build
```

Then **Run Prism Extension** (F5) via [`.vscode/launch.json`](../../.vscode/launch.json).

Package / publish: [PUBLISH.md](./PUBLISH.md).

## Privacy

Core analysis stays local. Optional network features are off by default and
consent-gated. Details: [https://www.prismhq.in/privacy](https://www.prismhq.in/privacy)

# Prism

[![VS Marketplace version](https://vsmarketplacebadges.dev/version/prismhq.repo-prism.svg)](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism)
[![VS Marketplace installs](https://vsmarketplacebadges.dev/installs/prismhq.repo-prism.svg)](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism)
[![VS Marketplace downloads](https://vsmarketplacebadges.dev/downloads/prismhq.repo-prism.svg)](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism)
[![Open VSX version](https://img.shields.io/open-vsx/v/prismhq/repo-prism)](https://open-vsx.org/extension/prismhq/repo-prism)
[![Open VSX downloads](https://img.shields.io/open-vsx/dt/prismhq/repo-prism)](https://open-vsx.org/extension/prismhq/repo-prism)
[![verify](https://img.shields.io/github/actions/workflow/status/Shailesh200/prism/verify.yml?branch=main&label=verify)](https://github.com/Shailesh200/prism/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/github/license/Shailesh200/prism)](./LICENSE)

**Local-first Software Intelligence Engine** for humans and AI agents.

> Google Maps + Engineering Intelligence + MCP Tools for Software

Prism is **not** an AI coding assistant. It is the intelligence layer that powers IDE extensions, CLI workflows, and MCP-compatible agents.

## Install the IDE extension (RepoPrism)

Published as **`prismhq.repo-prism`** (display name **RepoPrism**).

| Client | Install |
|---|---|
| **VS Code** | [Marketplace — RepoPrism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) · Extensions → search `RepoPrism` / `@id:prismhq.repo-prism` |
| **Cursor** | [Open VSX — RepoPrism](https://open-vsx.org/extension/prismhq/repo-prism) · Extensions → search `RepoPrism`. If search lags: Command Palette → **Extensions: Install from VSIX…** |

**After install:** open a folder → Command Palette → **Prism: Open Prism**.

### Important links

| Link | What |
|---|---|
| [VS Marketplace listing](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) | Installs / downloads / version for VS Code |
| [Open VSX listing](https://open-vsx.org/extension/prismhq/repo-prism) | Cursor-friendly registry listing |
| [Publisher hub](https://marketplace.visualstudio.com/manage/publishers/prismhq/extensions/repo-prism/hub) | Versions, stats, publish history |
| [GitHub repo](https://github.com/Shailesh200/prism) | Source |
| [Issues](https://github.com/Shailesh200/prism/issues) | Bugs & feature requests |
| [Publish / CI notes](./packages/vscode-extension/PUBLISH.md) | VSIX packaging, Marketplace + Open VSX, Actions secrets |
| [publish-extension workflow](https://github.com/Shailesh200/prism/actions/workflows/publish-extension.yml) | Auto-publish on `main` |

## Status

| Item | State |
|---|---|
| Master Plan | **APPROVED** |
| Architecture docs (M-000) | **Verified** |
| Active milestone | **M-001** Project Foundation |

| Document | Purpose |
|---|---|
| [`plans/00_MASTER_DEVELOPMENT_PLAN.md`](./plans/00_MASTER_DEVELOPMENT_PLAN.md) | Single source of truth |
| [`plans/architecture/`](./plans/architecture/) | HLD / LLD / tech / folder / flows |
| [`plans/PROGRESS.md`](./plans/PROGRESS.md) | Milestone status board |
| [`plans/START_HERE.md`](./plans/START_HERE.md) | Workflow after approval |
| [`AGENTS.md`](./AGENTS.md) | Rules for coding agents |

## Requirements

- **Node.js ≥ 26** (`.nvmrc` → 26)
- **Bun** ≥ 1.3 (package manager + scripts)
- **moonrepo** (via `@moonrepo/cli` in the repo)

```bash
nvm use        # or install Node 26
bun install
bun run verify:milestone
```

## Scripts

| Command | Purpose |
|---|---|
| `bun run format` / `format:check` | Oxfmt |
| `bun run lint` | Oxlint |
| `bun run typecheck` | `moon run :typecheck` |
| `bun run test` | `moon run :test` |
| `bun run build` | `moon run :build` |
| `bun run verify:milestone` | Full milestone gate |

Git hooks: **Lefthook** (`lefthook.yml`) — oxfmt + oxlint on pre-commit.

## Monorepo

- `packages/*` — `@prism/*` engine and surface stubs  
- `apps/playground`, `apps/docs` — app stubs  
- Tooling: Bun workspaces · moonrepo · TypeScript strict · Oxlint/Oxfmt · Vitest  

## Deliverables (target)

1. **Core** — indexing, AST, graphs, intelligence, impact, health  
2. **VS Code / Cursor** extensions — **RepoPrism** ([Marketplace](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) · [Open VSX](https://open-vsx.org/extension/prismhq/repo-prism))  
3. **MCP Server**  
4. **CLI**  

## Principles

Local-first · Offline-first · Privacy-first · AI-agnostic · One shared Core · Extensible plugins

## License

[MIT](./LICENSE)

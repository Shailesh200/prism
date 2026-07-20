# Prism

**Local-first Software Intelligence Engine** for humans and AI agents.

> Google Maps + Engineering Intelligence + MCP Tools for Software

Prism is **not** an AI coding assistant. It is the intelligence layer that powers IDE extensions, CLI workflows, and MCP-compatible agents.

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
2. **VS Code / Cursor** extensions  
3. **MCP Server**  
4. **CLI**  

## Principles

Local-first · Offline-first · Privacy-first · AI-agnostic · One shared Core · Extensible plugins

## License

[MIT](./LICENSE)

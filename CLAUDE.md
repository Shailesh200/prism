# CLAUDE.md — Claude / Agent Notes for Prism

> Companion to [`AGENTS.md`](./AGENTS.md). Follow both.

## Project

**Prism** — local-first Software Intelligence Engine (maps, graphs, impact, health) exposed via Core, MCP, CLI, and IDE extensions.

## Before writing code

1. Confirm Master Plan status is **APPROVED** (`plans/00_MASTER_DEVELOPMENT_PLAN.md`).
2. Confirm **M-000 Architecture Documentation** is **Verified** (HLD/LLD/tech docs under `plans/architecture/`).
3. Confirm exactly one milestone is `In Progress` in `plans/PROGRESS.md`.
4. Work only on `milestone/M-XXX-…` branch created from latest `main`.
5. Implement only that milestone’s In Scope items.  
   First code milestone is **M-001** (after M-000).

## Do not

- Develop on `main`
- Stack milestone branches
- **Create git commits before the owner explicitly approves** (keep work in the working tree until then)
- Push remotes unless the human owner explicitly requests it
- Bypass `@repo-prism/core` from MCP/CLI/extensions
- Add cloud/network dependencies to Core analysis paths
- Expand milestone scope silently

## Preferred workflow

```text
Read milestone doc → implement (no commits) → bun run verify:milestone → fix → request owner review → owner approves → commit on milestone branch → owner approves merge → merge locally to main → mark Verified → share short “what changed” snippet with owner → next branch from main
```

## Packages (mental model)

| Package | Role |
|---|---|
| shared | contracts |
| analyzer / indexer / graph-engine | engine internals |
| intelligence / impact / navigation / repository-map | domain engines |
| core | **public SDK** |
| mcp-server / cli / vscode-extension / cursor-extension / ui | surfaces |

## MCP

When editing `@repo-prism/mcp-server`, every tool must call Core and return JSON-serializable DTOs from `@repo-prism/shared`.

## Verification

Always run `bun run verify:milestone` before asking for review.

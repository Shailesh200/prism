# CLAUDE.md — Claude / Agent Notes for Prism

> Companion to [`AGENTS.md`](./AGENTS.md). Follow both.

## Project

**Prism** — local context and change checks for coding agents, exposed via Core, MCP, CLI, and IDE extensions.

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
| intelligence / impact / navigation | domain engines |
| checks | receipt checks |
| plugin | Claude Code plugin pack, skills and hooks |
| daemon | one local process that keeps each repo's index fresh and answers over loopback (ADR-0063) |
| core | **public SDK** (analysis) |
| mcp-server / cli | surfaces |
| ui | components for the docs website |

## MCP

Tools call Core and return JSON-serializable DTOs from `@repo-prism/shared`.
All MCP tools are registered, including `receipt`. `extraTools` is not required.

## Verification

Always run `bun run verify:milestone` before asking for review.

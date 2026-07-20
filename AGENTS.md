# AGENTS.md — Working on Prism

This repository is **Prism**, a local-first Software Intelligence Engine (formerly working name RepoPulse).

## Source of truth

1. [`plans/00_MASTER_DEVELOPMENT_PLAN.md`](./plans/00_MASTER_DEVELOPMENT_PLAN.md)
2. Active milestone doc under `plans/milestones/`
3. [`plans/PROGRESS.md`](./plans/PROGRESS.md)

If code and plan disagree, **stop and reconcile the plan** before continuing.

## Hard Rules (mandatory)

- Never implement product code before the Master Plan is approved **and M-000 (architecture docs) is Verified**.
- **Never create git commits until the owner explicitly approves** (e.g. “approve”, “commit”, “approve M-XXX”). Keep changes uncommitted until then.
- One active milestone at a time.
- One milestone = one Git branch.
- Never develop on main.
- Never stack milestone branches.
- Never merge without owner approval.
- Never push unless owner explicitly asks.
- Every milestone must pass the complete verification suite.
- Every merge to main must leave the repository buildable.
- Every milestone must update the Master Plan progress.

## Architecture rules

- All user-facing surfaces (MCP, CLI, VS Code, Cursor, Playground) consume **`@prism/core` only**.
- Do not reimplement analysis inside extensions or MCP tools.
- Prefer smaller milestones; do not expand scope without owner approval.
- New architectural choices require an ADR in `plans/adr/`.
- Privacy default: no network calls for core analysis.

## Branch convention

```text
milestone/M-XXX-short-name
```

## Verification

```bash
bun run verify:milestone
```

## What Prism is / is not

- **Is:** repository intelligence, maps, graphs, impact analysis, MCP tools for agents
- **Is not:** an AI coding assistant / LLM product

## When unsure

1. Read the active milestone DoD
2. Check architecture docs: `plans/architecture/` (after M-000)
3. Check Open Questions: `plans/OPEN_QUESTIONS.md`
4. Ask the owner before inventing scope

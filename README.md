# Prism

**Local-first Software Intelligence Engine** for humans and AI agents.

> Google Maps + Engineering Intelligence + MCP Tools for Software  
> Formerly working name: **RepoPulse**

Prism is **not** an AI coding assistant. It is the intelligence layer that powers IDE extensions, CLI workflows, and MCP-compatible agents.

## Status

**Planning phase.** Implementation starts only after the Master Development Plan is approved.

| Document | Purpose |
|---|---|
| [`plans/00_MASTER_DEVELOPMENT_PLAN.md`](./plans/00_MASTER_DEVELOPMENT_PLAN.md) | Single source of truth |
| [`plans/PROGRESS.md`](./plans/PROGRESS.md) | Milestone status board |
| [`plans/START_HERE.md`](./plans/START_HERE.md) | First commands after approval |
| [`plans/OPEN_QUESTIONS.md`](./plans/OPEN_QUESTIONS.md) | Decisions still needed |
| [`AGENTS.md`](./AGENTS.md) | Rules for coding agents |

## Deliverables (target)

1. **Core** — indexing, AST, graphs, intelligence, impact, health  
2. **VS Code Extension** — Map, explorer, overlays  
3. **Cursor Extension** — native Cursor experience  
4. **MCP Server** — tools for agents  
5. **CLI** — scripting & CI  

## Tooling (planned)

- **Bun** + **moonrepo** + **Node ≥ 26**  
- **Oxc** parser · **Oxlint + Oxfmt** · **Vitest** · **Vite**  
- **ngraph** · **better-sqlite3** · **React Flow** · **Lefthook**  
- Details: `plans/adr/0003-locked-performance-stack.md`, `plans/TOOLING_AND_CI.md`  
- Design: `plans/DESIGN_SYSTEM.md` (**Signal Chart**)

## Principles

Local-first · Offline-first · Privacy-first · AI-agnostic · One shared Core · Extensible plugins

## Hard Rules

- Never implement code before the Master Plan is approved.
- One active milestone at a time.
- One milestone = one Git branch.
- Never develop on main.
- Never stack milestone branches.
- Never merge without owner approval.
- Never push unless owner explicitly asks.
- Every milestone must pass the complete verification suite.
- Every merge to main must leave the repository buildable.
- Every milestone must update the Master Plan progress.

## License

TBD in M-001 (default proposal: MIT — see Open Questions).

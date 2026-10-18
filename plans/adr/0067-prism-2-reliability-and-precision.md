# ADR-0067: Prism 2.0 reliability and precision decisions

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-14) |
| Date | 2026-10-14 |
| Program | [prism-unified-plan.md](../notes/prism-unified-plan.md) close-out C-1 |

## Context

Prism 2.0 implements the unified reliability and precision plan. These decisions were made during the plan and are recorded here as accepted.

## Decision

1. **No backward compatibility.** 1.x tool names, env vars, RPCs and UI packages (VS Code extension, app-shell, playground) are deleted, not deprecated.
2. **Automatic 1.x wipe.** Installing 2.0 removes 1.x data under `~/.prism`.
3. **Local-only install while developing.** Every install points at the local build; no `npx …@latest` paths.
4. **Global lenses.** Lenses live only at `~/.prism/lenses`.
5. **Symbol-level blast.** Blast radius follows referenced symbols, not whole-file imports.
6. **Type-only edges are excluded from cycles.**

## Consequences

- Upgrading from 1.x is a clean install; nothing old is read.
- Blast and cycle results are smaller and more precise.
- ADR-0064 and ADR-0066 stand as amended by the 2.0 implementation.

# ADR-0002: Bun package manager, Node 26, lint/format toolchain

| Field | Value |
|---|---|
| Status | Superseded in part by ADR-0003 (lint → Oxlint/Oxfmt; monorepo → moon; parser/graph updates) |
| Date | 2026-07-20 |
| Decision makers | Owner |
| Related milestones | M-001 |
| Supersedes | Stack defaults in Master Plan v0.1 (pnpm, Node 22, Biome-only note) |

## Context

Owner requested:

1. Use **Bun** instead of pnpm
2. Target **latest stable Node** (Current: **26.5.x** as of 2026-07)
3. Compare **Biome** vs **Oxlint + Oxfmt** before locking lint/format

## Decision

| Area | Choice |
|---|---|
| Package manager / script runner | **Bun** (`bun install`, `bun run …`, Bun workspaces) |
| Node engine | **Node.js ≥ 26** (pin `.nvmrc` / `.node-version` to latest Current 26.x; re-pin in M-001) |
| Lint + format (default) | **Biome** (`biome check`) for M-001+ |
| Revisit | If lint/format becomes a bottleneck or Prettier 100% parity is required, evaluate **Oxlint + Oxfmt** via a superseding ADR |

### Runtime nuance

- **Install & repo scripts:** Bun
- **VS Code / Cursor extension host:** Node (Electron) — packages must remain Node-compatible
- **CLI / MCP:** Prefer Bun-first scripts; keep Node-compatible builds so consumers without Bun can run published binaries

## Options Considered — Lint / Format

### Biome (chosen default)

- Single binary: lint **and** format
- One config (`biome.json`)
- Excellent greenfield DX
- Strong TS/JS/JSON/CSS coverage
- Slightly slower than Ox on large repos; ~97% Prettier compatibility (intentional deviations)

### Oxlint + Oxfmt

- **Oxlint:** often ~2× faster than Biome lint; large rule set; ESLint-plugin compatibility path
- **Oxfmt:** often faster than Biome format; aims at 100% Prettier JS/TS conformance (maturing; was beta-class in early 2026)
- Two tools / two configs (or coordinated Oxc configs)
- Better fit when migrating off ESLint or needing max throughput on huge trees

### Comparison summary

| Criterion | Biome | Oxlint + Oxfmt |
|---|---|---|
| Lint + format in one tool | Yes | No (pair) |
| Config surface | One file | Two tools |
| Raw speed | Very fast | Usually faster |
| Prettier parity (format) | ~97% | Stronger (Oxfmt goal: 100% JS/TS) |
| Greenfield simplicity | **Best** | Good |
| ESLint plugin migration | Limited | Stronger |
| Type-aware lint | Biotype / built-ins | Via type-aware mode (heavier) |
| Prism fit (new OSS monorepo) | **Preferred** | Optional later |

## Consequences

- Use Bun workspaces via root `package.json` `workspaces` (no pnpm-workspace.yaml)
- Lockfile: `bun.lock`
- Verify command: `bun run verify:milestone`
- Document Node 26+ in engines; Bun required for contributors developing the monorepo
- Keep Biome as default unless owner later prefers Ox stack

## Compliance

- [x] Master Plan stack section updated
- [x] VERIFICATION / START_HERE / M-001 updated
- [ ] Implemented in M-001 (code) after plan approval

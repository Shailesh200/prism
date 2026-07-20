# M-001 — Project Foundation & Monorepo

| Field | Value |
|---|---|
| Branch | `milestone/M-001-project-foundation` |
| Status | Verified |
| Depends on | Master Plan **Approved** + **M-000 Verified** |
| Unlocks | M-002 |
| Packages touched | repo root, `packages/*` skeletons, `scripts/` |

## Goal

Establish a production-grade monorepo skeleton: **Bun** workspaces, **moonrepo**, TypeScript base, **Oxlint + Oxfmt**, **Vitest**, **Lefthook**, verify scripts, and empty package stubs with ownership READMEs.

## In Scope

- Root `package.json` (Bun workspaces), `bun.lock`, `moon.yml` / project moon configs, `tsconfig.base.json`
- Oxlint + Oxfmt config; Lefthook (`lefthook.yml`)
- `.gitignore`, `.nvmrc` / moon toolchain (**Node 26.x**), `LICENSE` (default MIT if approved)
- `scripts/verify-milestone` + `scripts/check-plan-progress.mjs`
- Package stubs `@prism/<name>` with README only (no product logic)
- `apps/playground` and `apps/docs` placeholders (hello build via Vite where needed)
- `bun run verify:milestone` green
- Document ADRs 0001–0003
- Update `plans/PROGRESS.md`

## Out of Scope

- AST, indexing, graphs, UI Map, MCP, extensions
- Publishing to npm
- Remote git push

## Deliverables

1. Bootable monorepo: `bun install && bun run verify:milestone` succeeds
2. moon tasks: typecheck, lint, test, build
3. Lefthook pre-commit (oxfmt/oxlint on staged files)
4. Contributor entry in `README.md`

## Definition of Done

- [x] `bun install` clean on macOS
- [x] moon + verify scripts green
- [x] Oxlint + Oxfmt wired
- [x] Lefthook installed/documented
- [x] Package stubs for all Master Plan packages
- [x] Node 26 + Bun toolchain pinned via moon
- [x] `plans/PROGRESS.md` updated
- [x] Owner approval recorded (2026-07-20)

## Verification

| Gate | Command / action |
|---|---|
| Format | `bunx oxfmt --check .` |
| Lint | `bunx oxlint .` |
| Typecheck | `moon run :typecheck` (or equiv.) |
| Unit tests | `moon run :test` / Vitest smoke |
| Build | `moon run :build` |
| Full | `bun run verify:milestone` |
| Manual | Structure matches Master Plan |
| Docs | README + PROGRESS + ADR-0003 linked |

## Risks

- `better-sqlite3` native ABI later — document Node 26 expectations early
- moon learning curve vs Turbo — keep M-001 configs minimal
- Extension host is Node even though monorepo uses Bun

## Owner Approval Checklist

- [x] Bun + Node 26 + moon + Oxlint/Oxfmt + Lefthook accepted
- [x] License choice confirmed (MIT)
- [x] Approve merge to main (local) — 2026-07-20

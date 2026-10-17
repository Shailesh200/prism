# M-084 — Surfaces + IDE merge

| Field | Value |
|---|---|
| Status | **Obsolete** (archived 17 Oct 2026) |
| Branch | `milestone/M-084-surfaces-ide` |
| Depends on | M-083 Verified |
| Packages | `surfaces` (mcp, cli, host), `jobs`, `ide` |
| How | [IMPLEMENTATION_prism-2.0.md](./IMPLEMENTATION_prism-2.0.md) §5 M-084 |


## Status (17 Oct 2026)

Obsolete. There is no IDE surface left to merge. `packages/vscode-extension` and `packages/cursor-extension` were deleted in 2.0 (commit `f45ccb7`, Decision 27). `prism doctor --surfaces` only flags a leftover Marketplace install as drift (`cli/src/commands/surfaces.ts`). Publishing stays on `@repo-prism/*`, not `@prismate/*`.

## 1. Goal

Collapse surface packages. Publish `@prismate/{mcp,cli,core}`. IDE stays VSIX (Marketplace publisher from M-081).

## 2. In scope

Folder moves, moon/workspace/`docs:check`, one-major shims from `@repo-prism/mcp-server` etc.

## 3. Out of scope

Tool rename. GitHub remote move and npm org create (M-086). `@prismate/ide` on npm.

## 4. Definition of Done

- [ ] `cli` / `mcp` bins still start
- [ ] IDE is VSIX only
- [ ] `bun run verify:milestone` green

## 5. Verification ritual

Master Plan §8.1 + §9 + §10. No commits until the owner asks.

## 6. After merge

Open **M-085** from `main`.

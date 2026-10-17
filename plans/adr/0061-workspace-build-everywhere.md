# ADR-0061: Developing Prism uses the workspace build on every host

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-089 One build everywhere](../milestones/M-089_one-build-everywhere.md) |
| Amends | [ADR-0050](./0050-prism-plugin-pack.md) (plugin pack) — dev mode |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §2 |

## Context

On the owner's machine, Cursor loaded two Prism servers. One was the local build. The other was the installed Claude plugin, a frozen 1.12.0 copy running `npx @repo-prism/mcp-server@latest`. Claude Code hooks were registered twice, and one copy fell back to the published server. A Marketplace extension (1.0.0) was installed. The build ran on one Node version and the editors on another. The developer could not tell which Prism answered.

## Decision

1. **Dev pack mode.** The plugin generator emits a dev pack whose MCP entry and hook environment point at this checkout's `dist` with a pinned Node, and with self-update off. The public pack still uses `npx`.
2. **One registration per host.** `bun run dev:link` installs the dev pack into Claude Code (and so into Cursor, which loads Claude plugins), removes the duplicate registrations after backing them up, replaces the Marketplace extension with the local VSIX, and pins Node 24.18.1. If Cursor does not run plugin hooks, `dev:link` writes `~/.cursor/hooks.json` from the same definition, and this ADR records which case applies.
3. **`prism doctor --surfaces`** resolves every host's Prism registration to workspace build, published npm, published plugin, marketplace extension or other. Inside the Prism repo it fails on anything published or duplicated. The session hook reports drift.
4. `dev:unlink` restores the backups. Neither command runs in CI.
5. **Why 24.18.1 and not the newest 24.x.** Node 24.19.0 and later back-ported `ObjectWrap` cleanup hooks without the registry they need, and `better-sqlite3` 12 aborts when a `Statement` is collected ([nodejs/node#65446](https://github.com/nodejs/node/issues/65446)). It crashed Core's test suite on 24.21.0. The pin moves up when that issue is fixed, or when Prism moves to `better-sqlite3` 13, which uses N-API.

## Consequences

- The owner always tests what they are building.
- `$HOME` files are edited by a script, with backups and a tested restore.
- Public install instructions are unchanged.

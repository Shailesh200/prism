# M-089 — One build everywhere

| Field | Value |
|---|---|
| Status | **Built, not verified** — round 4 open (published install path) |
| Branch | `milestone/M-089-one-build-everywhere` (from latest `main`) |
| Depends on | M-088 Verified |
| Unlocks | M-090; closes M-078 |
| Packages | `packages/plugin` (`definition.ts`, `build-pack.ts`, `hooks/prism-hook.mjs`), `packages/cli` (`doctor --surfaces`), `scripts/` (`dev-link`, `dev-unlink`), root `package.json`, `.nvmrc`, `.gitignore` |
| ADR | [ADR-0061](../adr/0061-workspace-build-everywhere.md) |


## Status (17 Oct 2026)

- **Built:**
  - `.nvmrc` is 24.18.1, and `bun run dev:link` exists.
  - `prism doctor --surfaces` (`cli/src/commands/surfaces.ts`) flags npm, `npx @latest` and leftover Marketplace installs.
  - `prism install <claude|cursor|codex|opencode>` installs the local build (next plan P19/P21). The install matrix passes 4/4 on macOS (change report, round 3).
  - Every install on the owner's Mac points at the local build.
- **Changed:** the Marketplace and VSIX parts are dropped, because the IDE extensions were deleted in 2.0.
- **Round 4 (running):** `npm i -g @repo-prism/cli && prism start` failed outside the source checkout. The fix is made but has not been through the release gate yet. The CI OS matrix has not run (it needs a push).

## 1. Goal

Every Prism surface on the owner's machine runs this checkout's build. Nothing points at npm `@latest`, the published plugin, or the Marketplace extension, and a check catches drift. Program §2.

## 2. In scope

| Item | Detail |
|---|---|
| Node pin | Node 24.18.1 in `.nvmrc`, `engines`, moon toolchain, and `dev:link`. Rebuild `better-sqlite3`. Rerun the suite and mark M-078 Verified if green |
| Dev pack mode | `definition.ts` emits absolute `node` + `packages/mcp-server/dist/bin.js` and `PRISM_SKIP_SELF_UPDATE=1` in `mcp.json`, and bakes `PRISM_MCP_BIN` into the hook environment. Public pack unchanged |
| `bun run dev:link` | Build → dev pack → install into Claude Code from a local marketplace → enable → remove legacy registrations (P4 `~/.claude/settings.json` hooks, P5 `~/.cursor/mcp.json` `prism`) with backups in `~/.prism/backup/<ts>/` → uninstall Marketplace `prismhq.repo-prism` → install local VSIX → run doctor |
| `bun run dev:unlink` | Restores the backups |
| Cursor hooks | Verify whether this Cursor runs Claude-plugin hooks. If not, `dev:link` writes `~/.cursor/hooks.json` from the same definition. Record the result in ADR-0061 |
| `prism doctor --surfaces` | Per host (Cursor, Claude Code, Claude Desktop, opencode, Codex): server, hooks and skills resolved to workspace build / published npm / published plugin / marketplace / other. Fails on published or duplicate inside the Prism repo |
| Hook E6 | Log copy path, `cwd` source and workspace key. Resolve the workspace from the host's field (Cursor `workspace_roots`), then the git root |
| Session drift notice | The session hook runs the doctor fast path and says so on drift |
| Repo `opencode.json` | Gitignored (Q-1) |
| Docs | "Developing Prism" section in `CONTRIBUTING.md` |

## 3. Out of scope

- Changing the public install docs or published packages.
- Tool surface changes (M-091).

## 4. DoD

- [ ] After `dev:link`, Cursor lists **one** Prism server whose tools equal this checkout's `DEFAULT_TOOL_NAMES`
- [ ] Claude Code lists one Prism plugin with version = `packages/mcp-server/package.json`
- [ ] `prism doctor --surfaces` green; re-adding an `npx … @latest` entry turns it red
- [ ] One stop event → exactly one receipt and one `hook-log` line, in both Claude Code and Cursor
- [ ] New sessions on this repo show orientation, not "still indexing", while a snapshot exists
- [ ] Marketplace extension gone; local VSIX installed
- [ ] `dev:unlink` restores the prior state (tested once)
- [ ] Suite green on Node 24.18.1 → M-078 Verified
- [ ] Claude Code smoke session transcript saved to `plans/notes/smoke/M-089.md`
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` on Node 24.18.1 · `bun run dev:link` · `prism doctor --surfaces` · one Claude Code and one Cursor session on this repo.

## 6. Risks

- Editing `$HOME` configs: every edit is backed up first, and `dev:unlink` is tested before DoD.
- The Claude Code plugin CLI may change: `dev:link` checks the `claude` version and stops with a clear message rather than guessing.

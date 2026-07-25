# ADR-0025: Marketplace packaging (staged VSIX)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-26 |
| Related | [ADR-0020](./0020-cursor-packaging-overlay.md), M-047 |

## Context

`@prism/vscode-extension` is a Bun workspace package (`name` scoped,
`private: true`). The Visual Studio Marketplace requires an unscoped extension
`name`, a non-private manifest, MIT (or other OSI) license, icon, and
repository metadata. Publishing the workspace `package.json` as-is fails `vsce`.

## Decision

1. Keep workspace identity as `@prism/vscode-extension` for Bun / moon / F5.
2. Stage a clean directory (`.vsix-stage/`) with Marketplace fields:
   - `name`: `repo-prism`
   - `publisher`: from workspace manifest (default `prismhq`)
   - `license`: `MIT`
   - no `private`
   - `dist/` (bundled host + webview + Electron `better-sqlite3`) and `media/`
3. Package / publish with `@vscode/vsce --no-dependencies` from the stage dir
   via `scripts/package-vsix.ts`.
4. Ship **one** Marketplace listing; Cursor uses the same VSIX or Open VSX
   (overlay package remains F5 / brand-only per ADR-0020).

## Consequences

- Positive: workspace tooling unchanged; Marketplace id is `prismhq.repo-prism`
- Positive: native module staging stays in the existing build script
- Negative: publisher id must be claimed before first publish; rename if taken
- Follow-up: Open VSX publish with the same VSIX (`ovsx`)

# M-047 — Extension Marketplace

| Field | Value |
|---|---|
| Branch | `milestone/M-047-extension-marketplace` |
| Status | Verified |
| Depends on | M-030, M-031, M-032 |
| Unlocks | Installable Prism from Marketplace / Open VSX |
| Packages | `@repo-prism/vscode-extension` |

## Goal

Make the VS Code extension **Marketplace-ready**, produce a VSIX, document
sideload + publish, and publish when the owner has a publisher + PAT.

## In Scope

- Marketplace metadata (license MIT, icon, repository, keywords)
- Staged VSIX packaging (`scripts/package-vsix.ts`) — [ADR-0025](../adr/0025-marketplace-packaging.md)
- `.vscodeignore` + `PUBLISH.md` sideload / Marketplace / Open VSX checklist
- One product listing (`prismhq.repo-prism`); Cursor via same VSIX or Open VSX
- GitHub Actions `publish-extension.yml` (bump + VS Marketplace + Open VSX on `main`)

## Out of Scope

- Claiming the Marketplace publisher account (owner browser / Azure DevOps)
- Separate Cursor Marketplace listing
- MCP / CLI surfaces
- CI auto-publish (optional follow-up)

## Definition of Done

- [x] ADR-0025 accepted; packaging script produces `.vsix`
- [x] `PUBLISH.md` documents login, package, sideload, publish
- [x] Owner smoke-tests sideload VSIX
- [x] Owner publishes with PAT (`vsce` / `ovsx`)
- [x] Owner approval → commit → merge → Verified
- [x] GitHub Actions publish workflow + README install URLs

## Verification

`bun run verify:milestone` · `bun run --filter @repo-prism/vscode-extension package:vsix` · Manual sideload checklist in `PUBLISH.md`

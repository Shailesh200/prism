# M-030 — VS Code Extension Shell

| Field | Value |
|---|---|
| Branch | `milestone/M-030-vscode-shell` |
| Status | Verified |
| Depends on | M-018, M-025 |
| Unlocks | M-031, M-032 |
| Packages | `@prism/vscode-extension`, `@prism/ui`, `@prism/core` |

## Goal

Activate a VS Code extension that loads Core against the open workspace, shows a
status bar item, and hosts a webview shell ready for the Map.

## In Scope

- Extension manifest, activation events
- Core lifecycle tied to workspace folders
- Webview host loading `@prism/ui` map (even if limited data)
- Commands: `Prism: Open Repository Map`, `Prism: Reindex`
- Logging channel + status bar

## Out of Scope

- Full explorer / blast radius UX (M-031)
- Cursor-specific packaging (M-032)

## Definition of Done

- [x] Extension launches in Extension Development Host (`.vscode/launch.json`)
- [x] Reindex command completes on sample workspace (PrismSession + command wired)
- [x] Webview shows Map from Core data (`RepositoryMapView` + postMessage)
- [x] Owner approval → commit → merge → Verified

## Verification

`bun run verify:milestone` · Manual Extension Host checklist (F5)

## Manual checklist

1. Open this repo in VS Code / Cursor
2. Run **Run Extension** (F5) → Extension Development Host
3. Open a sample folder (or this repo)
4. Command Palette → **Prism: Reindex** → Output “Prism” shows success
5. **Prism: Open Repository Map** → webview shows map nodes from Core

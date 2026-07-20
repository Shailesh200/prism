# M-030 — VS Code Extension Shell

| Field | Value |
|---|---|
| Branch | `milestone/M-030-vscode-shell` |
| Status | Not Started |
| Depends on | M-018, M-025 |
| Unlocks | M-031, M-032 |
| Packages | `@prism/vscode-extension`, `@prism/ui` |

## Goal

Activate a VS Code extension that loads Core against the open workspace, shows a status bar item, and hosts a webview shell ready for the Map.

## In Scope

- Extension manifest, activation events
- Core lifecycle tied to workspace folders
- Webview host loading `@prism/ui` map (even if limited data)
- Commands: `Prism: Open Repository Map`, `Prism: Reindex`
- Logging channel

## Out of Scope

- Full explorer / blast radius UX (M-031)
- Cursor-specific packaging (M-032)

## Definition of Done

- [ ] Extension launches in Extension Development Host
- [ ] Reindex command completes on sample workspace
- [ ] Webview shows Map from Core data
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Build · Manual Extension Host checklist

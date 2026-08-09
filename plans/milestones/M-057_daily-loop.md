# M-057 — Daily Loop (IDE Hero)

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-057-daily-loop` (from latest `main`) |
| Depends on | M-056 |
| Unlocks | M-058 |
| Packages | `@repo-prism/vscode-extension`, `@repo-prism/cli`, `@repo-prism/core`, `@repo-prism/shared`, `@repo-prism/app-shell` |
| Amends | — |

## 1. Goal

A developer can keep Prism installed and live in it all day. The IDE extension becomes the hero
surface for humans — stale index state is visible, impact is one keystroke away, settings converge
across CLI and extension, and the first-run experience is transparent.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-B1** | Index goes stale silently — watcher only registers after the panel opens; [`settings-store.ts:81`](../../packages/app-shell/src/settings-store.ts) defaults `autoReindex: false`; [`docs/ide/settings.md`](../../docs/ide/settings.md) documents wrong defaults. | On activation ([`extension.ts:195-216`](../../packages/vscode-extension/src/extension.ts)) register a `createFileSystemWatcher` feeding Core `notifyWatchPaths` independent of the panel; status bar shows `stale` when the dirty set is non-empty; flip the default to `true`; correct the docs (5 MB, On). Tests: settings-default unit test; watcher-wiring test. |
| **P-B2** | No "review all changes" in the IDE — CLI has it ([`change.ts:145-166`](../../packages/cli/src/commands/change.ts)). | New `prism.reviewAllChanges` command calling Core `getChangedPaths({})` and opening Change Review with the result; SCM title-bar entry. Tests: command registration + happy path. |
| **P-B3** | Every impact action costs a webview. | `prism.blastQuickPick` — runs blast on the active file, shows a Quick Pick (risk band, top 8 dependents, "Open full Impact"); flip CodeLens default to on for TS/JS ([`package.json:185`](../../packages/vscode-extension/package.json)). |
| **P-B4** | No keybindings. | `contributes.keybindings` — blast current file and review-all-changes. |
| **P-B5** | Opaque first-run progress. | [`runtime.ts:150-157`](../../packages/cli/src/runtime.ts) forwards the indexer's existing `onProgress` phases to stderr (phase + files done/total) when TTY and not `--json`/`--quiet`. |
| **P-B6** | CLI and extension settings diverge. | `.prism/config.json` (`excludeGlobs`, `maxFileBytes`) with a schema in `@repo-prism/shared`; Core reads it at workspace open; the extension settings store writes through and migrates from localStorage; CLI inherits via Core. Tests: precedence flags > config > defaults. |
| **P-B7** | Multi-root indexes only folder 0. | Index all `workspaceFolders`; status-bar menu switches the active folder; document the behaviour. |
| **P-B8** | No shell completions. | `prism completions bash\|zsh\|fish` generated from the command registry. |
| **P-B9** | Node 26.5 pin (locked: widen). | `engines` to `>=22`; CI matrix 22/24/26 for core/cli/mcp tests; README badge. |
| **P-B10** | Panel never opens itself. | One-time-per-workspace toast after the first successful index with an "Open Prism" action. |
| **P-B11** | No stale signal in the CLI. | Commands compare `snapshot.indexedAt` against working-tree mtimes and print a stderr hint when stale; `prism doctor --ci` warns on shallow clones (`git rev-parse --is-shallow-repository`). |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| MCP agent surface improvements | M-058 Agent Surface v2 |
| Bounded graph dumps and new MCP tools | M-058 |
| UI IA merge (Codebase Profile → DNA) | M-062 UI Actionability |
| GitHub Action and SARIF output | M-060 CI and PR Integration |

## 4. Definition of Done

- [ ] M-056 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-B1 through P-B11 each tested
- [ ] A maintainer can edit for an hour with the panel closed and the status bar never lies
- [ ] `.prism/config.json` schema documented in `CORE_SDK.md`
- [ ] `bun run verify:milestone` green
- [ ] Owner smoke: first-run progress visible; blast Quick Pick works from keyboard
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 2
- [M-051 Hardening](./M-051_hardening.md) — watch correctness baseline
- [M-048 Extension Polish](./M-048_extension-polish.md) — editor hooks and review commands
- [ADR-0019](../adr/0019-core-sdk-versioning.md) SDK versioning

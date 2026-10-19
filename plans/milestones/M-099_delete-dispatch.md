# M-099 — Delete Dispatch + dead UI

| Field | Value |
|---|---|
| Status | **Done** (widened by 2.0), not owner-verified |
| Branch | `milestone/M-099-delete-dispatch` (from latest `main`) |
| Depends on | M-098 Verified |
| Unlocks | M-100 |
| Packages | delete `packages/dispatch`, `packages/dispatch-hub`; prune `app-shell`, `vscode-extension` (`host-dispatch*`), `cursor-extension`, `cli` (Dispatch commands), `host-session` (Dispatch RPC), `docs/` |
| ADR | [ADR-0064](../adr/0064-dispatch-removed.md) |
| Absorbs | M-082 (re-scoped) |


## Status (17 Oct 2026)

- Done in commit `f45ccb7`: 901 files changed and about 203k lines deleted.
- Deleted: `dispatch`, `dispatch-hub`, `app-shell`, `apps/playground`, `host-session`, `repository-map`, `vscode-extension` and `cursor-extension`, plus the health, report and feature tools (unified plan §0.4).
- 13 packages are published today, plus 2 private ones (`test-support`, `ui`).
- A `deleted-names` check guards against the names coming back.
- Envelope was removed later as well (17 Oct 2026).

## 1. Goal

Remove everything that only existed for jobs and the retired screens, leaving one slim product: Prepare, ~~Envelope~~, Graph, Receipt, ~~Health~~ (Envelope removed 17 Oct 2026; health deleted in 2.0). Program §4.4 steps 2–4, §10.

## 2. In scope

| Item | Detail |
|---|---|
| Pre-check | `safe_delete` and `find_references` report for every exported symbol of `dispatch` and `dispatch-hub`; anything still referenced from kept code is moved first or the milestone stops |
| Remove shims | The `dispatch` re-exports of ~~Envelope~~ / prepare-last / memory from M-091 |
| Delete packages | `packages/dispatch`, `packages/dispatch-hub` (the daemon already lives in `packages/daemon`) |
| UI | Remove Jobs, Live Relay remnants, Skills editor, standup, Domains, Repository Map, Pulse / Board / List screens from `app-shell`; the IDE webview keeps Graph, Iris, Receipts, Health, Settings |
| Extension | Remove `host-dispatch*` and Dispatch commands from `vscode-extension` / `cursor-extension` |
| Docs | Archive Dispatch docs; remove them from nav |
| Data | `prism data prune` learns to remove `~/.prism/hub` and Dispatch state |
| Lines | Report before / after line counts per package |

## 3. Out of scope

- Engine package merge (M-083, deferred). Website (M-100).

## 4. DoD

- [ ] 23 → about 18 packages; ≥ 50k fewer TS/TSX lines, reported
- [ ] No source reference to `@repo-prism/dispatch` or `dispatch-hub` remains
- [ ] Extension builds, installs via `dev:link`, and shows only the kept screens
- [ ] `verify:milestone` green; e2e smoke green
- [ ] Claude Code smoke on a fixture: Prepare → edit → receipt end-to-end; transcript saved
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `bun run test:e2e` · `bun run dev:link` and a manual look at the IDE webview.

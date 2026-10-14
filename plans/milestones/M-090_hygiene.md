# M-090 — Hygiene

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-090-hygiene` (from latest `main`) |
| Depends on | M-089 Verified |
| Unlocks | M-091 |
| Packages | `packages/cli` (`prism data prune`), `plans/` (archive, ADR index), git refs (local only) |

## 1. Goal

Clear the machine and the repository of leftovers so the next milestones start clean. Program §4.1, §4.2, and §4.5 (the plans part).

## 2. In scope

| Item | Detail |
|---|---|
| Branch table | `plans/notes/M-090-branches.md`: every `dispatch/*`, `cursor/*`, `chore/*` branch with last commit, merged into `main`, and worktree. Owner marks keep or delete; only then are branches deleted |
| Worktrees | Remove the five Dispatch worktrees (two already `prunable`) after the table is approved, then `git worktree prune` |
| Stashes | Drop `stash@{0}` (Live Relay, D4). For each other stash, a one-line diff summary in the same note; owner marks apply or drop per item |
| Stale plugin cache | Remove `~/.claude/plugins/cache/prism-local/prism/1.12.0` (already replaced by M-089) |
| `prism data prune` | Dry run by default, `--yes` to act. Keeps the Envelope ledger, receipts, prepare history, hook snapshot and current index. Drops caches of workspaces no longer on disk and finished Dispatch worktrees |
| Plans archive | Move Verified milestone docs M-000 → M-079 to `plans/archive/milestones/`, fix links, keep `PROGRESS.md` rows as one-liners with links |
| ADR index | `plans/adr/INDEX.md`: number, title, status, superseded-by |
| Template | `plans/milestones/TEMPLATE.md`: one-page milestone template |

## 3. Out of scope

- Deleting any package or source file (M-099).
- Pushing `main` (Q-4, owner only).

## 4. DoD

- [ ] Branch, worktree and stash tables approved by the owner and applied
- [ ] `git worktree list` shows only the main checkout
- [ ] `prism data prune` dry run lists what it would remove; `--yes` removes only that; tests cover keep-rules
- [ ] `docs:check` green after the archive move (no broken links)
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `git branch -a` / `git stash list` / `git worktree list` before and after, recorded in the note.

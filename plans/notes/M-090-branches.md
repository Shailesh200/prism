# M-090 — Branches, worktrees and stashes

Recorded 2026-10-10, before cleanup. The owner approved deleting every `dispatch/*`, `cursor/*` and `chore/*` branch and every Dispatch worktree, keeping none (program Q-3), and dropping the Live Relay stash (D4).

Every SHA below stays in the object store until `git gc` prunes it. To restore a branch: `git branch <name> <sha>`. To restore the stash: `git stash store -m "Live Relay" 210f264`.

## Worktrees (removed)

All five lived under `~/.prism/workspaces/6e57fd75050e6740a153cf33/dispatch/worktrees/`. None had uncommitted changes. Two were already `prunable`, their directories gone.

| Worktree | Branch | SHA |
|---|---|---|
| `fix-unused-export-hubregistry-in-apps-playground` | `dispatch/fix-unused-export-hubregistry-in-apps-playground` | `f762427` |
| `fix-unused-export-hubworkspace-in-apps-playgroun` | `dispatch/fix-unused-export-hubworkspace-in-apps-playgroun` | `6fb7c27` |
| `smoke-live-card` | `dispatch/smoke-live-card` | `ada3115` |
| `smoke-live-card-2` | `dispatch/smoke-live-card-2` | `348868f` |
| `smoke-live-relay` | `dispatch/smoke-live-relay` | `4a97d85` |

## Branches (deleted)

| Branch | SHA | Last commit | In `main` |
|---|---|---|---|
| `chore/publish-npm-1.1.8` | `7a7826c` | 2026-08-31 | yes |
| `cursor/auto-workspace-latest-3396` | `bfed379` | 2026-08-31 | yes |
| `cursor/fix-dispatch-git-repo-3396` | `77de10b` | 2026-08-29 | yes |
| `cursor/publish-npm-1-1-6-3396` | `eb0abef` | 2026-08-29 | yes |
| `cursor/publish-oidc-3396` | `172b452` | 2026-08-31 | yes |
| `dispatch/ask-dispatch-vs-inline-cursor-model-dashboard-re` | `7274af6` | 2026-09-05 | yes |
| `dispatch/attention-cards-inline-start-resume-pause-cancel` | `e07d3c8` | 2026-09-05 | yes |
| `dispatch/audit-find-issues-in-the-repo` | `9021348` | 2026-08-26 | yes |
| `dispatch/audit-issues-in-this-repo` | `9021348` | 2026-08-26 | yes |
| `dispatch/audit-test-cases` | `f247e05` | 2026-09-05 | yes |
| `dispatch/collapsed-rail-icon-and-compact-job-tooltip` | `4b7f9a0` | 2026-09-05 | yes |
| `dispatch/console-actions-retry-child-errors-checkout-defa` | `ed3d3ac` | 2026-09-06 | yes |
| `dispatch/contain-console-width-land-approved-jobs-seconda` | `d7f4084` | 2026-09-04 | yes |
| `dispatch/copy-iris-prepare-paths` | `de37bc2` | 2026-09-14 | **no** |
| `dispatch/dummy-console-check` | `fd2e3ac` | 2026-09-07 | yes |
| `dispatch/envelope-cli-sarif` | `24365c6` | 2026-09-11 | yes |
| `dispatch/fix-unused-export-hubregistry-in-apps-playground` | `f762427` | 2026-09-16 | **no** |
| `dispatch/fix-unused-export-hubworkspace-in-apps-playgroun` | `6fb7c27` | 2026-09-16 | **no** |
| `dispatch/job-2405972d` | `9021348` | 2026-08-26 | yes |
| `dispatch/resume-button-on-stop-message-and-copy-job-link` | `14231f0` | 2026-09-05 | yes |
| `dispatch/review-all-the-uncommitted-changes` | `3297e5b` | 2026-09-06 | yes |
| `dispatch/smoke-live-card` | `ada3115` | 2026-09-24 | **no** |
| `dispatch/smoke-live-card-2` | `348868f` | 2026-09-24 | **no** |
| `dispatch/smoke-live-relay` | `4a97d85` | 2026-09-24 | **no** |
| `dispatch/smoke-test-dispatch-token-telemetry` | `c8ed18a` | 2026-09-17 | yes |
| `dispatch/smoke-test-m-074-job-cost-telemetry` | `6ba4fa4` | 2026-09-16 | yes |
| `dispatch/standup-briefing` | `cdcc54c` | 2026-08-26 | yes |
| `dispatch/v1` | `a74283a` | 2026-08-26 | yes |
| `dispatch/v2-agentic` | `78eadc3` | 2026-08-31 | yes |
| `dispatch/verify-prepare-change-history-1-3` | `c8ed18a` | 2026-09-17 | yes |

## Stashes

| Stash | SHA | What it is | Decision |
|---|---|---|---|
| Live Relay (`stash@{0}` before cleanup) | `210f264` | M-079 Jobs Live Relay code, 8 files, MCP server and instructions | **Dropped** (D4) |
| console sanity + pack gaps + intelligence drafts | `3a30d9f` | 28 files, +2,142 / −553, mostly `packages/ui` tokens and primitives | Owner to decide. Recommendation: drop; the UI it targets is slimmed in M-099 |
| lefthook auto backup | `33fd494` | 146 files, +13,373 / −6,854; an automatic lefthook backup, not a work item | Owner to decide. Recommendation: drop |
| npx prefer-online lock (keep off 1.8.2 PR) | `aebbeba` | 12 files; `auto-update.ts` and plugin `definition.ts` | Owner to decide. Recommendation: drop; M-089 turned self-update off in the dev pack and replaced `mcpConfig` |
| 1.1.8 version bumps (pre-audit) | `d0cae28` | 6 files of version strings for 1.1.8 | Owner to decide. Recommendation: drop; superseded by later releases |
| WIP on main: oxfmt Calendar leftovers | `b5ed60a` | `packages/dispatch/package.json` only | Owner to decide. Recommendation: drop; Dispatch is deleted in M-099 |
| lefthook auto backup | `5c93010` | 38 files, +5,806 / −735, M-050 bundle-weight era | Owner to decide. Recommendation: drop |

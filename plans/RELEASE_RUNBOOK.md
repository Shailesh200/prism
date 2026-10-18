# Release runbook (Prism 2.0.0)

This is what the owner runs to release Prism 2.0.0, what each step sets off, and how to back out.

Rewritten on 17 Oct 2026. The 1.x runbook was about tagging a VSIX for the VS Marketplace and Open VSX. That no longer applies, because the IDE extensions were deleted in 2.0 (`f45ccb7`). The npm release history is in `CHANGELOG.md` and git tags (`prism-npm-v1.8.x`, `repo-prism-v1.x`).

**Rules:**
- Only **2.0.0** is released, once, after the reliability work is done.
- Every step below that leaves the machine (commit, push, tag, publish, deploy) needs the owner's explicit go-ahead.
- Until then, every Prism install points at the local build.

## What a release ships

| Artifact | Where | Trigger |
|---|---|---|
| 2 npm packages at `2.0.0`: `@prismapp/mcp-server` and `@prismapp/cli`. The other libraries (`shared`, `analyzer`, `graph-engine`, `impact`, `navigation`, `indexer`, `intelligence`, `core`, `checks`, `daemon`, `plugin`) are private and packed inside those two tarballs (`scripts/publish-npm.mjs`) | npm | push to `main` → `.github/workflows/publish-npm.yml` (also `prism-npm-v*` and `workflow_dispatch`). A version already on npm is skipped. |
| GitHub Action `Shailesh200/prism/action@v2` | this repo, `action/` | a `v2` tag on the release commit |
| Website | `prismhq.in` (Vercel, `apps/website/vercel.json`) | Vercel on push to `main`, only when `apps/website` changed. The changelog page reads `CHANGELOG.md` from GitHub `main`, so a new version shows up without a site rebuild. |

`test-support` and `ui` stay private, and so do the libraries packed into the CLI and the server.

## Before you release

Each of these should already be true. This is a check, not a task list.

| Check | Command | Expected |
|---|---|---|
| Owner review done (planned 18 Oct 2026) | — | go-ahead to commit |
| Working tree committed on the branch, merged to `main` | `git status` | nothing to commit |
| Full verification | `bun run verify:milestone` | exits 0 |
| Release gate (GATE-T1..T4: B1 ratio ≤ 1, B6 Claude Code and opencode with Prism ≤ without on tokens and cost, success not lower, public repos only, regenerable) | `bun run bench:release-gate` | exits 0 |
| Publish dry run (also runs the release gate) | `bun run publish:npm:dry` | exits 0 |
| npm would load what we publish | `bun run scripts/check-publish-exports.mjs` | exits 0 |
| The MCP process starts | `bun run scripts/check-mcp-start.mjs` | exits 0 |
| Versions agree | every public `packages/*/package.json` | `2.0.0` |

Then test the real thing people install, not the source. In a clean `HOME`, install the packed tarballs (`npm pack` per package) with `npm i -g`, then run `prism start` in a repository Prism has never seen. Check:
- `prism doctor` is ok;
- one agent session gets Prepare;
- the stop receipt prints a verdict.

## Known blockers (17 Oct 2026)

- **The release gate fails 1 check:** Claude Code cost on small tasks (change report, round 3, item 4). Round 4 re-tests it.
- **Fixed 17 Oct:** the publish workflow's build list was missing `checks`, `daemon` and `cli`. It now builds all 13 publish packages in dependency order. `check-mcp-start` no longer looks for the deleted `dispatch-hub`. A fresh build plus a publish dry run passed, run in a throwaway copy with the release gate skipped.
- **`publish-npm.yml` runs on every push to `main`.** The release gate still stops the publish when it fails. The website deploy starts from the same push and does not wait on this job.
- **Not runnable locally:** the CI OS install matrix and ACT-1 (the Action on a real fork PR). Both need a push. See OPEN_QUESTIONS Q-031.

## Releasing

1. Owner approves. Commit, then merge to `main`.
2. That merge starts npm publish and the website deploy together. The site builds only when `apps/website` changed. npm publish skips a version that is already on npm.
3. `git tag v2` on the same commit, then `git push origin v2`. This is for the Action, separate from npm.
4. Do this only with the owner's go-ahead (Focus Reset Q-4: do not push `main` without it).

## What the merge to main sets off

`publish-npm.yml` runs these steps in order:
1. Install, then build the publishable packages.
2. **Release gate** (`release-gate.mjs`). A failure stops the run.
3. `check-publish-exports --against-npm` and `check-mcp-start`.
4. `bun run publish:npm`. Auth uses OIDC trusted publishing. The script skips any version that already exists on npm.

Steps 1–3 are safe. Step 4 can't be undone.

## If something is wrong

- **Before the tag is pushed:** `git tag -d prism-npm-v2.0.0`, fix, then re-tag.
- **Tag pushed, nothing published yet:** cancel the run in Actions, then `git push --delete origin prism-npm-v2.0.0` and `git tag -d prism-npm-v2.0.0`.
- **Published:** the version is used up. Fix it and release `2.0.1`. If the build is harmful (data loss, a network call nobody agreed to), deprecate it on npm (`npm deprecate @repo-prism/<pkg>@2.0.0 "<reason>"`) first, then fix.
- **Half published** (some packages made it, some didn't): re-run the workflow with `workflow_dispatch`. Packages already published are skipped.
- **Website:** roll back to the previous production deployment in Vercel.

## Version relationships

- All 13 public packages carry the same version and ship from the same commit.
- 2.0 has no 1.x compatibility (ADR-0067). Installing over 1.x data wipes it. Custom lenses and config are kept.
- Core's public surface is governed by [ADR-0019](./adr/0019-core-sdk-versioning.md). `packages/core/src/api-surface.test.ts` pins the method list.

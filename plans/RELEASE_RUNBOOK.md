# Release runbook

What the owner runs to release Prism, what happens when they do, and how to
get out of it if something is wrong.

Publishing to the VS Marketplace and Open VSX **cannot be undone**. A version
number, once published, is spent. That is why every step below is deliberate
and why the release is triggered by pushing a tag rather than by merging.

## Before you release

Everything here should already be true; this is a check, not a task list.

| Check | Command | Expected |
|---|---|---|
| Working tree clean on `main` | `git status` | nothing to commit |
| Full verification | `bun run verify:milestone` | exits 0 |
| Browser suite | `bun run test:e2e` | all pass |
| Performance budgets | `bun run bench:check` | exits 0 |
| Versions agree | `node -p "require('./packages/vscode-extension/package.json').version"` | `1.0.0` |

Then smoke the actual artifact, because everything above tests the source
rather than the thing people install:

```bash
bun run --cwd packages/vscode-extension package:vsix
code --install-extension packages/vscode-extension/*.vsix
```

Open a repository Prism has never seen. Confirm the map draws, health scores,
and blast radius answers for a file you pick at random. If any screen is empty,
find out whether it is empty because the repository has nothing to show or
because something is broken — those look identical to a user, which is why
[ADR-0029](./adr/0029-signal-provenance.md) exists.

## Releasing

One command:

```bash
git push origin repo-prism-v1.0.0
```

Nothing else. Do not push the tag with `--force`, and do not create the tag on
anything other than the commit you smoked.

## What that sets off

`.github/workflows/publish-extension.yml` fires on the `repo-prism-v*` tag and:

1. **Checks the tag against `package.json`.** `repo-prism-v1.0.0` must match
   the version in `packages/vscode-extension/package.json`. A mismatch fails
   the job before anything is built — this is the guard that stops a tag typo
   from publishing the wrong version under the right name.
2. **Builds five platform VSIXs**, one per target.
3. **Publishes to the VS Marketplace and Open VSX.**
4. **Creates a GitHub release** with the artifacts attached.

Steps 1–2 are safe. Step 3 is the irreversible one.

## If something is wrong

**Before the tag is pushed** — delete the local tag, fix, re-tag:

```bash
git tag -d repo-prism-v1.0.0
```

**After the tag is pushed but the workflow has not published yet** — cancel the
workflow run in the Actions tab. Then delete the remote tag:

```bash
git push --delete origin repo-prism-v1.0.0
git tag -d repo-prism-v1.0.0
```

**After it has published** — the version is spent. You cannot replace 1.0.0;
you release 1.0.1. Unpublishing is possible on the marketplace but leaves
people who already installed 1.0.0 on a version that no longer exists, which is
worse than a fast follow-up.

```bash
# fix, then:
# bump packages/vscode-extension/package.json to 1.0.1, commit,
git tag repo-prism-v1.0.1
git push origin repo-prism-v1.0.1
```

If the published build is actively harmful rather than merely wrong —
data loss, an unconsented network call — unpublish first and fix second. The
marketplace listing has an "Unpublish" action; Open VSX requires deleting the
version through their API.

## Re-running a publish

The workflow accepts `workflow_dispatch` with an existing tag, for the case
where publishing failed halfway — one registry accepted and the other did not.
It is a recovery path, not a way to re-release: the version guard still applies.

## Version relationships

The extension, the CLI, the MCP server and the Core SDK all carry the same
version and ship from the same commit. The tag names the extension version
because that is the artifact the marketplace knows about, but it releases all
four.

Core's public surface is what [ADR-0019](./adr/0019-core-sdk-versioning.md)
governs: from 1.0.0 onward, a breaking change to a `PrismWorkspace` method
requires a major bump. `packages/core/src/api-surface.test.ts` pins the method
list, so removing or renaming one fails the build rather than surprising a
consumer.

## npm

Not part of this release. `@repo-prism/*` packages are workspace-internal and
`private: true`. Publishing them is gated on the scope question (Q-003), which
is deferred past GA — the extension is the artifact people install, and nothing
about it needs an npm scope.

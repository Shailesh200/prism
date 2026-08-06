# Publish Prism to the Marketplace

Marketplace extension id: **`prismhq.repo-prism`** (publisher `prismhq` / display name **Prism**, extension name `repo-prism`).

The Bun workspace package remains `@repo-prism/vscode-extension`. Packaging stages a
clean folder via `scripts/package-vsix.ts` (see [ADR-0025](../../plans/adr/0025-marketplace-packaging.md)).

## Prerequisites (one-time)

### Visual Studio Marketplace

1. Publisher **`prismhq`** is already created at [Marketplace manage](https://marketplace.visualstudio.com/manage/publishers/prismhq).
2. Create an Azure DevOps PAT:
   - Open: https://dev.azure.com → User settings → Personal access tokens → **New Token**
   - Organization: **All accessible organizations**
   - Scope: **Marketplace → Manage**
3. Login:

```bash
cd packages/vscode-extension
bunx @vscode/vsce login prismhq
# paste PAT
```

### Open VSX (Cursor-friendly)

1. Register at [https://open-vsx.org](https://open-vsx.org).
2. Create an access token under your profile.
3. Create namespace `prismhq` if prompted (`ovsx create-namespace prismhq`).

## Build + package VSIX

From repo root:

```bash
bun install
# Apple Silicon Mac / Cursor:
cd packages/vscode-extension && bun run scripts/package-vsix.ts --target darwin-arm64
```

Produces `packages/vscode-extension/repo-prism-<version>@darwin-arm64.vsix`.

**Important:** the VSIX must match your OS. A Linux CI “universal” package ships a Linux `better-sqlite3` binary and will fail to activate on macOS (`command 'prism.open' not found`). CI publishes separate targets (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`).

The TypeScript parser (`oxc-parser`) is also native: packaging stages the matching `@oxc-parser/binding-*` into the VSIX and rewrites Bun’s absolute `createRequire` paths so activation does not depend on the build machine’s monorepo layout.

## Sideload smoke test (required before publish)

```bash
# Cursor: Extensions → … → Install from VSIX…
# or if `code` CLI is on PATH:
code --install-extension packages/vscode-extension/repo-prism-0.1.0.vsix
```

Checklist:

1. Open a folder / workspace
2. **Prism: Open Prism** → Overview indexes
3. Map / Domains / Blast navigate
4. **Prism: Reindex**
5. **Prism: Open in Browser** (loopback bridge)

## Publish

### VS Code Marketplace

```bash
cd packages/vscode-extension
bun run publish:vsix
# or after packaging:
bunx @vscode/vsce publish --packagePath repo-prism-0.1.0.vsix
```

### Open VSX

```bash
cd packages/vscode-extension
bunx ovsx publish repo-prism-0.1.0.vsix -p "$OVSX_TOKEN"
```

## CI publish (GitHub Actions)

Workflow: [`.github/workflows/publish-extension.yml`](../../.github/workflows/publish-extension.yml)

**Publishing fires only on a `repo-prism-v*` tag.** Merging to `main` never releases.

### Release ritual

```bash
# 1. Bump the version (from repo root)
bun run packages/vscode-extension/scripts/bump-extension-version.ts patch

# 2. Commit the bump
git add packages/vscode-extension/package.json
git commit -m "chore(extension): bump Prism to X.Y.Z"

# 3. Tag it — the tag version MUST match package.json
git tag repo-prism-vX.Y.Z

# 4. Push the tag. This is the release.
git push origin repo-prism-vX.Y.Z
```

CI then verifies the tag matches `package.json`, builds all five platform VSIXs, and publishes to
**VS Marketplace** and **Open VSX**. A mismatch between the tag and `package.json` fails the run
before anything is published.

Pushing the commit without the tag is safe and publishes nothing.

### Why a tag

A release is a decision, not a side effect of merging. The previous trigger — any push to `main`
touching `packages/**` — meant that merging a Core-only milestone shipped a public release with no
human involved, and CI pushed its own bump commit back to `main`. A tag records the decision in
history, which a path filter cannot do (see [M-051](../../plans/milestones/M-051_hardening.md) Phase 0).

### Recovery

If a publish fails partway, re-run it against the existing tag: Actions → **publish-extension** →
**Run workflow** → enter the tag name. This re-publishes without creating a new version.

### Required GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VSCE_PAT` | Azure DevOps PAT with **Marketplace → Manage** (same as `vsce login`) |
| `OVSX_TOKEN` | Open VSX access token |

Until both secrets exist, the workflow fails fast at “Check publish secrets”.

## Owner publish gate

1. Azure DevOps PAT with **Marketplace → Manage**
2. `bunx @vscode/vsce login prismhq`
3. Sideload-smoke the VSIX (checklist above)
4. Either publish locally with `bun run publish:vsix`, or push a `repo-prism-v*` tag and let CI do it
5. Optional Open VSX with `OVSX_TOKEN`
6. For CI: add `VSCE_PAT` + `OVSX_TOKEN` repo secrets (above)

## Verify

- [Marketplace manage](https://marketplace.visualstudio.com/manage/publishers/prismhq) shows the listing
- Fresh VS Code: Extensions → search **Prism** → Install
- Cursor: install from Open VSX or VSIX

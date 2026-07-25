# Publish Prism to the Marketplace

Marketplace extension id: **`prismhq.repo-prism`** (publisher `prismhq` / display name **RepoPrism**, extension name `repo-prism`).

The Bun workspace package remains `@prism/vscode-extension`. Packaging stages a
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
bun run --filter @prism/vscode-extension package:vsix
```

Produces `packages/vscode-extension/repo-prism-0.1.0.vsix`.

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

On every push to `main` that touches `packages/**` (or manual **Run workflow**):

1. Syncs version to max(local, Marketplace, Open VSX), then patch-bumps
2. Commits the bump with `[skip ci]` (avoids a publish loop)
3. Builds + packages the VSIX
4. Publishes to **VS Marketplace** and **Open VSX**

### Required GitHub secrets

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VSCE_PAT` | Azure DevOps PAT with **Marketplace → Manage** (same as `vsce login`) |
| `OVSX_TOKEN` | Open VSX access token |

Until both secrets exist, the workflow fails fast at “Check publish secrets”.

### Manual run

Actions → **publish-extension** → **Run workflow** → choose patch/minor/major.

## Owner publish gate

1. Azure DevOps PAT with **Marketplace → Manage**
2. `bunx @vscode/vsce login prismhq`
3. Sideload-smoke the VSIX (checklist above)
4. `bun run publish:vsix`
5. Optional Open VSX with `OVSX_TOKEN`
6. For CI: add `VSCE_PAT` + `OVSX_TOKEN` repo secrets (above)

## Verify

- [Marketplace manage](https://marketplace.visualstudio.com/manage/publishers/prismhq) shows the listing
- Fresh VS Code: Extensions → search **RepoPrism** → Install
- Cursor: install from Open VSX or VSIX

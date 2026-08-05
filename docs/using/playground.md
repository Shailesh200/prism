# The playground

**A browser version of the Prism interface, for trying it without installing an
extension — and for developing Prism itself.**

## Running it

From a clone of the repository:

```bash
bun install
bun run --filter '@repo-prism/playground' dev
```

Then open the URL it prints. Point it at a repository with the root input, or
start it with `PRISM_WORKSPACE` set.

## What it is for

**Trying Prism.** Every screen the extension has, without installing anything
into your editor.

**Developing Prism.** The playground and the extension share the same screen
components — the `@repo-prism/app-shell` package — so a change to a screen shows up in
both. The playground has a browser dev-tools loop, which the extension's webview
does not, so screen work happens here first.

## What is different from the extension

| | Playground | Extension |
|---|---|---|
| Opening a file in an editor | Not available | Yes |
| Workspace | Chosen by input or environment | The editor's folder |
| Reindex on save | Manual | Automatic |

The analysis itself is identical: both call the same engine and get the same
answers.

## Not a hosted product

The playground runs a local dev server against a local repository. There is no
Prism cloud, and no version of the playground that uploads your code somewhere.
See [consent and privacy](../concepts/consent-and-privacy.md).

## Related

[VS Code extension](./vscode-extension.md) · [Architecture overview](../architecture/overview.md)

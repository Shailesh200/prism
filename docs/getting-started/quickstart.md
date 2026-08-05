# Quickstart

**Five minutes, from an unfamiliar repository to knowing what is in it.**

Every command below runs against a real repository. Use one of your own — Prism
is more interesting when you can check whether it is right.

**Needs:** Node.js 26+, and either a global `prism` (`npm i -g @repo-prism/cli`)
or prefix every command with `npx -y @repo-prism/cli`.

## 1. Look before you index

```bash
cd your-repo
prism doctor
```

This tells you which directory Prism will treat as the workspace and how it
decided (`git root` is normal). If that is not the repository you meant, pass
`--workspace` or set `PRISM_WORKSPACE`.

A **warn** on Index cache on first run is expected — the next command that needs
an index will build one.

## 2. Build the index (optional)

```bash
prism index
```

You can skip this step: `dna`, `health`, `blast`, and the other analysis commands
call `index` themselves on first use. Running it now just makes the first
analysis feel snappy.

Prism stores the result in `.prism/cache/`. Later commands reuse it.

## 3. Ask what this project is

```bash
prism dna
```

**Repository DNA** is Prism's summary of what a project is built out of: the
frameworks and tools it detected, the domains it spans (frontend, backend, data,
infrastructure), and how confident it is about each.

## 4. Ask where the risk is

```bash
prism health
# optional: see which workspace was chosen and how long indexing took
prism health --verbose
```

A 0–100 score with the factors that produced it. Higher is better.

## 5. Ask what a change would break

```bash
prism blast src/some/file.ts
```

Add `--delete` to ask what breaks if the file goes away. Add `--fail-on high`
in CI to exit `1` when risk is high.

## 6. Ask what belongs together

```bash
prism explain src/some/directory
```

## 7. Make it useful in CI

```bash
prism blast src/critical/thing.ts --fail-on high
prism health --json | jq '.data.score'
```

See [Using the CLI](../using/cli.md) for exit codes and global options.

## 8. (Optional) Give an agent the same data

Follow the numbered steps in [Using MCP](../using/mcp.md). After that, ask the
agent in plain language — you never type tool names.

## What next

| You want | Go to |
|---|---|
| Install every surface step by step | [Install](./install.md) |
| The same thing, visually | [VS Code extension](../using/vscode-extension.md) |
| Cursor extension + agent | [Cursor](../using/cursor.md) |
| Every command | [CLI reference](../reference/cli-commands.md) |
| Something looks wrong | [Troubleshooting](../reference/troubleshooting.md) |

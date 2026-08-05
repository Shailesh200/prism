# Quickstart

**Five minutes, from an unfamiliar repository to knowing what is in it.**

Every command below runs against a real repository. Use one of your own — Prism
is more interesting when you can check whether it is right.

## 1. Look before you index

```bash
cd your-repo
prism doctor
```

This tells you which directory Prism will treat as the workspace and how it
decided. If that is not the repository you meant, pass `--workspace` explicitly
or set `PRISM_WORKSPACE`.

## 2. Build the index

```bash
prism index
```

Prism parses every source file and stores the result in `.prism/cache/index.sqlite`. It
reports how many files it read and any it skipped, with the reason. Later
commands reuse this index; they will build it themselves if it is missing.

A few thousand files takes seconds. Watch the warnings — a large number of
skipped files usually means a misconfigured exclude, not a broken repository.

## 3. Ask what this project is

```bash
prism dna
```

**Repository DNA** is Prism's summary of what a project is built out of: the
frameworks and tools it detected, the domains it spans (frontend, backend, data,
infrastructure), and how confident it is about each.

Confidence matters. Prism shows it because a detector that found a
`next.config.js` and a hundred matching imports is on much firmer ground than
one that found a single dependency in `package.json`.

## 4. Ask where the risk is

```bash
prism health
```

A 0–100 score with the factors that produced it. The factors are the useful
part; the single number is a headline.

Higher is better. If a factor scores badly, that is where to look.

## 5. Ask what a change would break

Pick a file you were thinking of editing:

```bash
prism blast src/some/file.ts
```

**Blast radius** is what else is affected if you change this file: what depends
on it directly, what depends on those, and how the risk is distributed. It is
the question you would otherwise answer with a nervous grep.

Add `--delete` to ask the harsher version — what breaks if this file goes away.

## 6. Ask what belongs together

```bash
prism explain src/some/directory
```

Prism describes an area in prose: what it appears to do, what it depends on,
what depends on it, and who has been working in it.

## 7. Make it useful in CI

Every command that produces a risk or a score accepts `--fail-on`, and exits `1`
when the threshold is met:

```bash
prism blast src/critical/thing.ts --fail-on high
echo $?
```

And every command speaks JSON, with nothing else on standard output:

```bash
prism health --json | jq '.data.score'
```

That combination — a real exit code and clean JSON — is the whole point of the
CLI. See [Using the CLI](../using/cli.md) for exit codes and global options.

## What next

| You want | Go to |
|---|---|
| The same thing, visually | [VS Code extension](../using/vscode-extension.md) |
| Every command | [CLI reference](../reference/cli-commands.md) |
| To understand what the numbers mean | [Concepts](../concepts/repository-index.md) |
| To give an agent this data | [MCP](../using/mcp.md) |
| Something looks wrong | [Troubleshooting](../reference/troubleshooting.md) |

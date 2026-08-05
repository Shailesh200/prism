# @prism/cli

The `prism` command. Local-first repository intelligence from a terminal or a CI
job — what a codebase is, how healthy it is, and what breaks if you change it.

All analysis runs on your machine. Nothing is uploaded.

## Install

Built from the repository root:

```bash
bun install
bun run build
```

The binary is `packages/cli/dist/cli.js`. Link it while developing:

```bash
cd packages/cli && bun link
```

## Commands

### Understand a repository

| Command | Purpose |
|---|---|
| `prism dna` | Identify languages, frameworks, domains and stack |
| `prism health` | Overall health score and the factors behind it |
| `prism map` | Repository map: clusters, landmarks and layers |
| `prism explain <path>` | What a file or folder is for, and who owns it |
| `prism explore <target>` | Usages, ownership and similar code for a file or symbol |
| `prism stack` | Detected stack signals, domains and personas |
| `prism features` | Inferred features and their confidence |
| `prism landmarks` | Entrypoints, package roots and feature anchors |
| `prism packages` | Packages in the workspace |

### Assess a change

| Command | Purpose |
|---|---|
| `prism blast <target>` | What breaks if this file or symbol changes |
| `prism review [paths...]` | Risk of the current changes, or of the paths you name |
| `prism safe-delete <target>` | Whether a file or symbol can be removed |
| `prism rename <target> [newName]` | Every edit site a rename would touch |
| `prism test-impact <target>` | Tests that a change can reach |

### Inspect structure

| Command | Purpose |
|---|---|
| `prism deps` | Dependency graph size and its most connected nodes |
| `prism cycles` | Import and re-export cycles |
| `prism symbol <name>` | Find where a symbol is declared |
| `prism refs <name>` | Find who references a symbol |
| `prism route <from> <to>` | How one file reaches another through dependencies |

### Reports

| Command | Purpose |
|---|---|
| `prism engineering` | Entropy, drift, debt, churn and hotspots |
| `prism testing` | Test structure and on-disk coverage |
| `prism security` | Left-shift tooling and configuration checklist |
| `prism backend` | Routes, data layer, env vars and background jobs |
| `prism bundle` | Bundle weight from an ingested stats artifact |

### Diagnostics

| Command | Purpose |
|---|---|
| `prism doctor` | Check the environment, workspace and index |
| `prism index` | Build or refresh the repository index |

## Global options

| Option | Effect |
|---|---|
| `-w, --workspace <path>` | Repository to analyse |
| `--json` | Emit JSON on stdout instead of human-readable output |
| `--no-color` | Disable ANSI colour (`NO_COLOR` is also honoured) |
| `-q, --quiet` | Suppress progress output on stderr |
| `--verbose` | Include extra detail |
| `-y, --yes` | Consent to operations that would otherwise be refused |
| `-V, --version` | Print the Core version and API level |

These work before or after the subcommand, so both of these are fine:

```bash
prism --json blast src/index.ts
prism blast src/index.ts --json
```

## Failing a build

This is the reason to run Prism from a terminal rather than an editor.

```bash
prism blast src/core/index.ts --fail-on high   # exit 1 when the band is High
prism review --base origin/main --fail-on high # exit 1 on a risky diff
prism cycles --fail-on any                     # exit 1 if any cycle exists
prism engineering --fail-on high               # exit 1 when a metric is bad
```

`--fail-on` takes a **band** — `low`, `mid` or `high` — on commands that produce
a risk or quality score, and fires at or above it. The bands come from
`riskToBand` in `@prism/shared`, the same helper the editor UI uses, so the
terminal and the Blast Radius screen cannot disagree about what "High" means.

On commands that count findings rather than scoring them (`cycles`,
`test-impact`) it takes `any` or a number instead.

## Which repository does it analyse?

Most explicit first:

1. `--workspace <path>`
2. `PRISM_WORKSPACE`
3. The nearest ancestor directory containing `.git`
4. The current working directory

Git-root discovery is what makes `prism health` work from three directories
deep. When it surprises you, `prism doctor` prints which workspace was chosen
and which of these rules chose it.

Path arguments resolve from **your** directory, not the repository root, so
`prism blast ./output.ts` works while standing in `packages/cli/src`. Paths
outside the workspace are refused rather than clamped.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Ran successfully |
| `1` | Ran successfully, and the analysis found what you asked about |
| `2` | Usage error — unknown flag, bad argument, missing command |
| `3` | Prism failed |

`1` and `3` are deliberately different. A CI job needs to distinguish "the tool
worked and your repository has a problem" from "the tool did not work", without
parsing output to find out which happened.

## Scripting

stdout carries data and nothing else. Progress, warnings and errors go to
stderr, so this is safe:

```bash
prism dna --json | jq '.data.frameworks'
```

Both success and failure use the same envelope, so one stream tells the whole
story:

```json
{ "ok": true, "data": { "languages": [] } }
{ "ok": false, "error": { "code": "PRISM_INVALID_PATH", "message": "…" } }
```

In `--json` mode errors go to **stdout** inside that envelope, so a script
reading one stream never misses a failure. In human mode they go to stderr and
stdout stays empty.

Colour is never emitted when stdout is not a terminal, so piped output needs no
`--no-color`.

`--json` returns the Core DTO verbatim and is never truncated. `--limit` only
bounds the human table, because a script that asked for JSON asked for all of
it.

## Notes

- **The first command in a repository is slow.** It builds the index. Later
  commands reuse the cache in `.prism/`.
- **`prism review` with no arguments reviews the working tree**, including
  untracked files — a new file nothing imports yet is exactly the change a
  review should notice. Pass `--base origin/main` in CI.
- **`prism rename` and `prism safe-delete` never write anything.** They report
  what a change would touch.
- **`prism security` is a configuration checklist, not a vulnerability scanner.**
  It tells you whether the left-shift tooling exists, not whether you are safe.
- **Features are inferred**, not declared. Low confidence means the grouping is
  a guess.

## References

- [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) — surfaces consume Core only
- [M-028](../../plans/milestones/M-028_cli-foundation.md) · [M-029](../../plans/milestones/M-029_cli-commands.md)

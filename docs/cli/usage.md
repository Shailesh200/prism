---
title: Using the CLI
description: "Global options, workspace resolution, exit codes, JSON, and CI gates."
---

`prism` runs the same engine as the extension, with real exit codes and clean
JSON — what makes it useful in a script.

Full command list: [CLI reference](/docs/reference/cli-commands).

## Global options

| Option | Effect |
|---|---|
| `-w, --workspace <path>` | Which repository to analyse |
| `--json` | Emit JSON on stdout instead of a human table |
| `--no-color` | Disable ANSI colour (`NO_COLOR` honoured too) |
| `-q, --quiet` | Suppress progress on stderr |
| `--verbose` | Workspace chosen + index timing on stderr |
| `-y, --yes` | Consent to an operation that would otherwise be refused |
| `-V, --version` | Engine version and API level |

No subcommand prints help and exits **0**. A near-miss typo exits **2** with a
suggestion.

## Which repository?

Most explicit wins: `--workspace` → `PRISM_WORKSPACE` → nearest `.git` ancestor →
cwd. `prism doctor` prints which rule won. Path arguments resolve from **your**
directory; paths outside the workspace are refused, not clamped.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Ran successfully |
| `1` | Ran successfully, and found what you gated on |
| `2` | Usage error |
| `3` | Prism itself failed |

## Failing a build

```bash
prism blast src/core/index.ts --fail-on high
prism review --base origin/main --fail-on high
prism cycles --fail-on any
prism engineering --fail-on high
```

`--fail-on` takes a [band](/docs/concepts/risk-bands) and fires at or above it.

## Scripting

```bash
prism dna --json | jq '.data.rankedDomains'
```

Success and failure share one JSON envelope. In `--json` mode errors go to
**stdout** inside that envelope. Colour is never emitted when stdout is not a
TTY. `--json` is never truncated; `--limit` bounds only the human table.

## Worth knowing

- First command in a repo is slow (builds the index); later commands reuse it.
- `prism review` with no args reviews the working tree, including untracked
  files. Pass `--base` in CI.
- `prism rename` and `prism safe-delete` never write — they only report.
- `prism security` is a config checklist, not a vulnerability scanner.

## Related

[Commands](/docs/cli/commands) · [Wire into CI](/docs/guides/wire-into-ci) ·
[Troubleshooting](/docs/reference/troubleshooting)

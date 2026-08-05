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

| Command | Purpose |
|---|---|
| `prism doctor` | Check the environment, the resolved workspace and the index |
| `prism index` | Build or refresh the repository index |
| `prism dna` | Identify languages, frameworks, domains and stack |

More commands land in M-029.

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

## Which repository does it analyse?

Most explicit first:

1. `--workspace <path>`
2. `PRISM_WORKSPACE`
3. The nearest ancestor directory containing `.git`
4. The current working directory

Git-root discovery is what makes `prism health` work from three directories
deep. When it surprises you, `prism doctor` prints which workspace was chosen
and which of these rules chose it.

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

## References

- [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) — surfaces consume Core only
- [M-028](../../plans/milestones/M-028_cli-foundation.md) — this milestone

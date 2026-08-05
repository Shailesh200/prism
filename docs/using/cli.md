# Using the CLI

**`prism` runs the same engine as the extension, from a terminal, with real exit
codes and clean JSON. That combination is what makes it useful in a script.**

For every command, see the generated [CLI reference](../reference/cli-commands.md).

## Global options

These work before or after the subcommand.

| Option | Effect |
|---|---|
| `-w, --workspace <path>` | Which repository to analyse |
| `--json` | Emit JSON on stdout instead of a human table |
| `--no-color` | Disable ANSI colour (`NO_COLOR` is honoured too) |
| `-q, --quiet` | Suppress progress output on stderr |
| `--verbose` | Include extra detail |
| `-y, --yes` | Consent to an operation that would otherwise be refused |
| `-V, --version` | Print the engine version and API level |

## Which repository does it analyse?

Most explicit wins:

1. `--workspace <path>`
2. The `PRISM_WORKSPACE` environment variable
3. The nearest ancestor directory containing `.git`
4. The current working directory

Git-root discovery is what lets `prism health` work from three directories deep.
When it surprises you, `prism doctor` prints which workspace it chose and which
rule chose it.

Path arguments resolve from **your** directory, not the repository root, so
`prism blast ./output.ts` works while you are standing in a subdirectory. A path
outside the workspace is refused, not clamped — clamping would report "nothing
depends on this" about a file Prism never looked at.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Ran successfully |
| `1` | Ran successfully, and found what you asked about |
| `2` | Usage error — unknown flag, bad argument, missing command |
| `3` | Prism itself failed |

`1` and `3` are deliberately different. A CI job needs to distinguish "the tool
worked and your repository has a problem" from "the tool did not work", without
parsing output to find out which happened.

## Failing a build

This is the reason to run Prism from a terminal rather than an editor.

```bash
prism blast src/core/index.ts --fail-on high    # exit 1 when the band is High
prism review --base origin/main --fail-on high  # exit 1 on a risky diff
prism cycles --fail-on any                      # exit 1 if any cycle exists
prism engineering --fail-on high                # exit 1 when a metric is bad
```

`--fail-on` takes a [band](../concepts/risk-bands.md) — `low`, `mid` or `high` —
and fires **at or above** it. You almost never want a gate that passes on the
worst case.

On commands that count findings rather than scoring them, it takes `any` or a
number instead.

The bands come from the same shared helper the editor uses, so the terminal and
the Blast Radius screen cannot disagree about what "High" means.

## Scripting

stdout carries data and nothing else. Progress, warnings and errors go to
stderr:

```bash
prism dna --json | jq '.data.rankedDomains'
```

Success and failure share one envelope, so a script reading one stream sees
everything:

```json
{ "ok": true, "data": { "languages": [] } }
{ "ok": false, "error": { "code": "PRISM_INVALID_PATH", "message": "…" } }
```

In `--json` mode, errors go to **stdout** inside that envelope, so a script
reading only stdout never misses a failure. In human mode they go to stderr and
stdout stays empty.

Colour is never emitted when stdout is not a terminal, so piped output needs no
`--no-color`.

`--json` returns the engine's data verbatim and is never truncated. `--limit`
bounds only the human table, because a script that asked for JSON asked for all
of it.

## A CI example

```yaml
- run: npx @prism/cli index
- run: npx @prism/cli review --base origin/main --fail-on high
- run: npx @prism/cli cycles --fail-on any
```

## Things worth knowing

- **The first command in a repository is slow.** It builds the index. Later
  commands reuse it.
- **`prism review` with no arguments reviews your working tree**, including
  untracked files — a new file nothing imports yet is exactly the change a
  review should notice. Pass `--base origin/main` in CI.
- **`prism rename` and `prism safe-delete` never write anything.** They report
  what a change would touch.
- **`prism security` is a configuration checklist, not a vulnerability scanner.**
  It tells you whether left-shift tooling exists, not whether you are safe.
- **Features are inferred, not declared.** Low confidence means the grouping is
  a guess. See [feature graph](../concepts/feature-graph.md).

## Related

[CLI reference](../reference/cli-commands.md) · [Troubleshooting](../reference/troubleshooting.md)
